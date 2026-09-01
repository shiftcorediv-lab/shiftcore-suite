import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const attendanceSource = await readFile(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8");
const contractSource = await readFile(new URL("../backend/account-apps-script/attendance_approval_contract.js", import.meta.url), "utf8");
const adminUiSource = await readFile(new URL("../js/attendance-admin/main.js", import.meta.url), "utf8");

test("勤怠GASは許可リスト型ログインプロキシを経由せずAccount GASを直接呼ぶ", () => {
  assert.match(attendanceSource, /const ACCOUNT_APPROVAL_API_URL = "https:\/\/script\.google\.com\/macros\/s\/[^\"]+\/exec"/);
  assert.doesNotMatch(attendanceSource, /const ACCOUNT_APPROVAL_API_URL = LOGIN_PROXY_URL/);
});

test("新規勤怠申請は内部ID・申請版・承認経路版を保存する", () => {
  assert.match(attendanceSource, /phase:\s*"prepare"/);
  assert.match(attendanceSource, /applicant_internal_user_id:\s*approval\.applicant_internal_user_id/);
  assert.match(attendanceSource, /request_version:\s*1/);
  assert.match(attendanceSource, /approval_reviewer_internal_user_id:\s*approval\.approval_reviewer_internal_user_id/);
  assert.match(attendanceSource, /applicant_organization_version:\s*approval\.applicant_organization_version/);
});

test("新規勤怠申請は本番シート契約の実勤務日列へ検証済み対象日を保存する", () => {
  assert.match(attendanceSource, /requests:\s*\[[^\]]*"実勤務日"/);
  assert.match(attendanceSource, /"実勤務日":\s*correction\.workDate/);
  assert.doesNotMatch(attendanceSource, /"実勤務日":\s*payload\.workDate\s*\|\|\s*today_\(\)/);
  assert.doesNotMatch(attendanceSource, /"対象日":\s*payload\.workDate/);
});

test("承認一覧と確認画面は実勤務日・申請開始・申請終了を表示する", () => {
  const renderRequestsSource = adminUiSource.match(/function renderRequests\(\)[\s\S]*?\nfunction openReview/)[0];
  const openReviewSource = adminUiSource.match(/function openReview\(id\)[\s\S]*?\n\$\("reviewDialog"\)/)[0];
  for (const field of ["実勤務日", "申請開始", "申請終了"]) {
    assert.match(renderRequestsSource, new RegExp(field));
    assert.match(openReviewSource, new RegExp(field));
  }
  assert.match(openReviewSource, /対象日時/);
});

test("承認は版一致とDocument Lockを必須にし管理roleの全件承認へ戻さない", () => {
  const reviewFunction = attendanceSource.match(/function reviewRequest_\([\s\S]*?\n}\n\nfunction approvalContractPayload_/)[0];
  assert.match(reviewFunction, /LockService\.getDocumentLock\(\)/);
  assert.match(reviewFunction, /expectedRequestVersion/);
  assert.match(reviewFunction, /VERSION_CONFLICT/);
  assert.doesNotMatch(reviewFunction, /requireAdmin_/);
  assert.match(adminUiSource, /buildReviewPayload\(reviewRequest,decision,reason\)/);
});

test("旧申請は自動変換せず再申請を要求し、異動後は経路再確認へ移す", () => {
  assert.match(attendanceSource, /LEGACY_REQUEST_REAPPLY_REQUIRED/);
  assert.match(attendanceSource, /APPROVAL_ROUTE_CHANGED/);
  assert.match(attendanceSource, /"状態":\s*"経路再確認"/);
  assert.match(contractSource, /normalizeOrganizationVersion_\(applicant\.organization_version\) !== expectedVersion/);
});

test("Account契約はサービス認証後に直属関係を再読取し同一イベントへ開始・完了を記録する", () => {
  assert.match(contractSource, /const phase = normalizeText\(body\.phase\);\s*requireAttendanceApprovalService_\(body\.service_secret\)/);
  assert.match(contractSource, /findOrganizationUserById_\(applicantId\)/);
  assert.match(contractSource, /assertApprovalReviewer_\(applicant, reviewer\)/);
  assert.match(contractSource, /result:\s*"started"/);
  assert.match(contractSource, /const eventId = normalizeText\(body\.authorization_event_id\)/);
  assert.match(contractSource, /source:\s*"attendance"/);
});

test("直属承認契約は自己承認・直属外・申請後の異動を拒否する", () => {
  const context = {
    console: { ...console, error: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "secret" }) },
    Utilities: { getUuid: () => "uuid" },
    ATTENDANCE_APPROVAL_SERVICE_SECRET_PROPERTY: "ATTENDANCE_APPROVAL_SERVICE_SECRET",
    normalizeText: value => String(value ?? "").trim(),
    normalizeOrganizationVersion_: value => Number(value || 0),
    normalizeOrganizationLevel_: value => String(value || ""),
    organizationAuthorizationError_: code => Object.assign(new Error(code), { code }),
    assertApprovalReviewer_: (applicant, reviewer) => {
      if (applicant.internal_user_id === reviewer.internal_user_id) throw Object.assign(new Error("SELF_APPROVAL_FORBIDDEN"), { code: "SELF_APPROVAL_FORBIDDEN" });
      if (applicant.direct_manager_user_id !== reviewer.internal_user_id) throw Object.assign(new Error("REVIEWER_MISMATCH"), { code: "REVIEWER_MISMATCH" });
      return true;
    }
  };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  const applicant = { internal_user_id: "U-1", organization_level: "member", direct_manager_user_id: "U-L1", organization_version: 3 };
  const reviewer = { internal_user_id: "U-L1", organization_level: "leader" };
  const body = { applicant_organization_version: 3, approval_reviewer_internal_user_id: "U-L1" };
  assert.equal(context.assertAttendanceApprovalRouteUnchanged_(applicant, reviewer, body), undefined);
  assert.throws(() => context.assertAttendanceApprovalRouteUnchanged_(applicant, { internal_user_id: "U-L2" }, body), /NOT_ASSIGNED_REVIEWER/);
  assert.throws(() => context.assertAttendanceApprovalRouteUnchanged_(applicant, applicant, { ...body, approval_reviewer_internal_user_id: "U-1" }), /SELF_APPROVAL_FORBIDDEN/);
  assert.throws(() => context.assertAttendanceApprovalRouteUnchanged_(applicant, { internal_user_id: "U-L2" }, { ...body, approval_reviewer_internal_user_id: "U-L2" }), /APPROVAL_ROUTE_CHANGED/);
  assert.throws(() => context.assertAttendanceApprovalRouteUnchanged_({ ...applicant, organization_version: 4 }, reviewer, body), /APPROVAL_ROUTE_CHANGED/);
});

function attendanceReviewContext(requestOverrides = {}) {
  const request = {
    request_id: "REQ-1", record_id: "", "状態": "申請中", "種別": "開始修正",
    "申請者メール": "member@example.com", "申請者氏名": "申請者",
    applicant_internal_user_id: "U-1", request_version: 1,
    approval_reviewer_internal_user_id: "U-L1", applicant_organization_version: 2,
    ...requestOverrides
  };
  let current = { ...request };
  let lockHeld = false;
  const calls = [];
  const context = {
    console: { ...console, error: () => {} },
    Date,
    JSON,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "secret" }) },
    LockService: { getDocumentLock: () => ({ waitLock: () => { lockHeld = true; }, releaseLock: () => { lockHeld = false; } }) },
    UrlFetchApp: {}, SpreadsheetApp: {}, Utilities: {}, ContentService: {}, MailApp: {}, Session: {}
  };
  vm.createContext(context);
  vm.runInContext(attendanceSource, context);
  context.ensureRequestContractHeaders_ = () => {};
  context.rows_ = name => name === "修正・予定外申請" ? [{ ...current }] : [];
  context.updateById_ = (sheet, column, id, changes) => { current = { ...current, ...changes }; calls.push({ type: "update", changes }); };
  context.createNotification_ = () => calls.push({ type: "notification" });
  context.accountApprovalRequest_ = payload => {
    calls.push({ type: "account", phase: payload.phase, result: payload.result, lockHeld });
    if (payload.phase === "authorize") return { ok: true, authorization_event_id: "ACE-1", reviewer_internal_user_id: "U-L1" };
    return { ok: true };
  };
  return { context, calls, getCurrent: () => current, isLockHeld: () => lockHeld };
}

test("割当外利用者の承認試行は申請状態を変更しない", () => {
  const fixture = attendanceReviewContext();
  assert.throws(() => fixture.context.reviewRequest_({ internal_user_id: "U-X", email: "x@example.com" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token"), /この申請の承認者ではありません/);
  assert.equal(fixture.getCurrent()["状態"], "申請中");
  assert.equal(fixture.calls.some(call => call.type === "update"), false);
  assert.equal(fixture.calls.some(call => call.type === "account" && call.phase === "authorize"), true);
  assert.equal(fixture.calls.some(call => call.type === "account" && call.phase === "finalize" && call.result === "error"), true);
});

test("保存済み承認者と現在の承認者が違っても経路変更時は経路再確認へ移す", () => {
  const fixture = attendanceReviewContext({ approval_reviewer_internal_user_id: "U-OLD" });
  fixture.context.accountApprovalRequest_ = payload => {
    fixture.calls.push({ type: "account", phase: payload.phase, result: payload.result });
    throw Object.assign(new Error("現在の直属承認経路では処理できません"), { code: "APPROVAL_ROUTE_CHANGED" });
  };
  assert.throws(
    () => fixture.context.reviewRequest_({ internal_user_id: "U-L1", email: "leader@example.com" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token"),
    error => error.code === "APPROVAL_ROUTE_CHANGED"
  );
  assert.equal(fixture.getCurrent()["状態"], "経路再確認");
  assert.equal(fixture.getCurrent().request_version, 2);
});

test("保存済み承認者と異なる利用者が未割当なら経路再確認へ移さない", () => {
  const fixture = attendanceReviewContext({ approval_reviewer_internal_user_id: "U-OLD" });
  fixture.context.accountApprovalRequest_ = payload => {
    fixture.calls.push({ type: "account", phase: payload.phase, result: payload.result });
    throw Object.assign(new Error("この申請の承認者ではありません"), { code: "NOT_ASSIGNED_REVIEWER" });
  };
  assert.throws(
    () => fixture.context.reviewRequest_({ internal_user_id: "U-X", email: "x@example.com" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token"),
    error => error.code === "NOT_ASSIGNED_REVIEWER"
  );
  assert.equal(fixture.getCurrent()["状態"], "申請中");
  assert.equal(fixture.getCurrent().request_version, 1);
  assert.equal(fixture.calls.some(call => call.type === "update"), false);
});

test("前後空白を含む保存済み承認者IDでも正規承認者を締め出さない", () => {
  const fixture = attendanceReviewContext({ approval_reviewer_internal_user_id: " U-L1 " });
  const result = fixture.context.reviewRequest_({ internal_user_id: "U-L1", email: "leader@example.com" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token");
  assert.equal(result.ok, true);
  assert.equal(fixture.getCurrent()["状態"], "承認済み");
});

test("Account外部呼出しはDocument Lock外で行う", () => {
  const fixture = attendanceReviewContext();
  let schemaEnsuredWithLock = false;
  fixture.context.ensureRequestContractHeaders_ = () => { schemaEnsuredWithLock = fixture.isLockHeld(); };
  const result = fixture.context.reviewRequest_({ internal_user_id: "U-L1", email: "leader@example.com", name: "承認者" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token");
  assert.equal(result.ok, true);
  assert.equal(schemaEnsuredWithLock, true);
  const accountCalls = fixture.calls.filter(call => call.type === "account");
  assert.deepEqual(accountCalls.map(call => call.phase), ["authorize", "finalize"]);
  assert.equal(accountCalls.some(call => call.lockHeld), false);
});

test("版競合は業務行を更新せずconflict終端監査を残す", () => {
  const fixture = attendanceReviewContext();
  assert.throws(() => fixture.context.reviewRequest_({ internal_user_id: "U-L1" }, { requestId: "REQ-1", expectedRequestVersion: 0, decision: "承認" }, "token"), /申請が更新されています/);
  assert.equal(fixture.getCurrent()["状態"], "申請中");
  assert.equal(fixture.calls.some(call => call.type === "account" && call.phase === "finalize" && call.result === "conflict"), true);
});

test("認可中に処理済みとなった申請はREQUEST_NOT_PENDINGで返す", () => {
  const fixture = attendanceReviewContext();
  fixture.context.accountApprovalRequest_ = payload => {
    fixture.calls.push({ type: "account", phase: payload.phase, result: payload.result });
    if (payload.phase === "authorize") {
      fixture.getCurrent()["状態"] = "承認済み";
      return { ok: true, authorization_event_id: "ACE-1", reviewer_internal_user_id: "U-L1" };
    }
    return { ok: true };
  };
  assert.throws(() => fixture.context.reviewRequest_({ internal_user_id: "U-L1" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token"), error => error.code === "REQUEST_NOT_PENDING");
  assert.equal(fixture.calls.some(call => call.type === "account" && call.result === "conflict"), true);
});

test("通知失敗は確定済み承認を失敗応答へ変えない", () => {
  const fixture = attendanceReviewContext();
  fixture.context.createNotification_ = () => { throw new Error("notification failed"); };
  const result = fixture.context.reviewRequest_({ internal_user_id: "U-L1", email: "leader@example.com" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token");
  assert.equal(result.ok, true);
  assert.equal(fixture.getCurrent()["状態"], "承認済み");
});

test("復元失敗はrecovery_requiredを記録して成功扱いにしない", () => {
  const fixture = attendanceReviewContext();
  fixture.context.accountApprovalRequest_ = payload => {
    fixture.calls.push({ type: "account", phase: payload.phase, result: payload.result });
    if (payload.phase === "authorize") return { ok: true, authorization_event_id: "ACE-1", reviewer_internal_user_id: "U-L1" };
    if (payload.result === "recovery_required") return { ok: true };
    throw Object.assign(new Error("finalize failed"), { code: "AUDIT_WRITE_FAILED" });
  };
  const originalUpdate = fixture.context.updateById_;
  fixture.context.updateById_ = (sheet, column, id, changes) => {
    if (changes["状態"] === "申請中") throw Object.assign(new Error("rollback failed"), { code: "ROLLBACK_FAILED" });
    originalUpdate(sheet, column, id, changes);
  };
  assert.throws(() => fixture.context.reviewRequest_({ internal_user_id: "U-L1" }, { requestId: "REQ-1", expectedRequestVersion: 1, decision: "承認" }, "token"), /管理者確認が必要/);
  assert.equal(fixture.calls.some(call => call.type === "account" && call.result === "recovery_required"), true);
  assert.equal(fixture.getCurrent()["状態"], "承認済み");
});

test("申請シートのヘッダー不足は空欄保存せず拒否する", () => {
  const fixture = attendanceReviewContext();
  const sheet = {
    getLastColumn: () => 2,
    getRange: () => ({ getValues: () => [["request_id", "状態"]] }),
    appendRow: () => assert.fail("schema mismatch must not append")
  };
  fixture.context.SpreadsheetApp.getActive = () => ({ getSheetByName: () => sheet });
  assert.throws(() => fixture.context.appendObject_("修正・予定外申請", { request_id: "REQ-1", applicant_internal_user_id: "U-1" }), /列が不足しています/);
});

test("承認経路のヘッダー整備は専用Document Lock内で行う", () => {
  const fixture = attendanceReviewContext();
  let ensuredWithLock = false;
  fixture.context.ensureRequestContractHeaders_ = () => { ensuredWithLock = fixture.isLockHeld(); };
  fixture.context.ensureRequestContractHeadersForReview_();
  assert.equal(ensuredWithLock, true);
  assert.equal(fixture.isLockHeld(), false);
});

test("非adminでも自分が直属承認者の申請だけを一覧取得できる", () => {
  const fixture = attendanceReviewContext();
  fixture.context.today_ = () => "2026-08-18";
  fixture.context.nowIso_ = () => "2026-08-18T00:00:00+09:00";
  fixture.context.getSchedules_ = () => [];
  fixture.context.settings_ = () => ({});
  fixture.context.canViewPreciseLocation_ = () => false;
  fixture.context.rows_ = name => name === "修正・予定外申請" ? [
    { request_id: "REQ-1", "状態": "申請中", approval_reviewer_internal_user_id: "U-L1" },
    { request_id: "REQ-2", "状態": "申請中", approval_reviewer_internal_user_id: "U-L2" }
  ] : [];
  const result = fixture.context.getAdminDashboard_({ internal_user_id: "U-L1", role: "member" }, "token");
  assert.deepEqual(Array.from(result.requests, item => item.request_id), ["REQ-1"]);
  assert.deepEqual(Array.from(result.people), []);
  assert.deepEqual(Object.keys(result.settings), []);
  assert.equal(result.preciseLocationAccess, false);
  assert.equal(fixture.context.hasApprovalReviewAccess_({ internal_user_id: "U-L1", role: "member" }), true);
});

test("非admin直属承認者は対象0件でも空配列を取得する", () => {
  const fixture = attendanceReviewContext();
  fixture.context.today_ = () => "2026-08-18";
  fixture.context.nowIso_ = () => "2026-08-18T00:00:00+09:00";
  fixture.context.getSchedules_ = () => [];
  fixture.context.settings_ = () => ({});
  fixture.context.canViewPreciseLocation_ = () => false;
  fixture.context.rows_ = () => [];
  const result = fixture.context.getAdminDashboard_({ internal_user_id: "U-L1", role: "member" }, "token");
  assert.deepEqual(Array.from(result.requests), []);
});

test("startedとsuccessを同じ監査イベントIDで実際に記録する", () => {
  const logs = [];
  const users = {
    "U-1": { internal_user_id: "U-1", status: "active", organization_level: "member", direct_manager_user_id: "U-L1", organization_version: 2 },
    "U-L1": { internal_user_id: "U-L1", status: "active", organization_level: "leader" }
  };
  const context = {
    console,
    ATTENDANCE_APPROVAL_SERVICE_SECRET_PROPERTY: "SECRET",
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "secret" }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => "event-1",
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
      computeDigest: (_algorithm, source) => Array.from(String(source), character => character.charCodeAt(0)),
      base64EncodeWebSafe: digest => digest.join("-")
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    normalizeText: value => String(value ?? "").trim(),
    normalizeOrganizationVersion_: value => Number(value || 0),
    normalizeOrganizationLevel_: value => String(value || ""),
    organizationAuthorizationError_: code => Object.assign(new Error(code), { code }),
    resolveCurrentUserByIdToken: () => ({ ok: true, user: { internal_user_id: "U-L1" } }),
    findOrganizationUserById_: id => users[id],
    assertApprovalReviewer_: (applicant, reviewer) => {
      if (applicant.direct_manager_user_id !== reviewer.internal_user_id) throw Object.assign(new Error("REVIEWER_MISMATCH"), { code: "REVIEWER_MISMATCH" });
    },
    appendAuthorizationChangeLog_: entry => { logs.push(entry); return entry; },
    recordAuthorizationRecovery_: () => assert.fail("recovery must not be used"),
    getAuthorizationChangeLogsSheet_: () => ({ getLastRow: () => 1 })
  };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  const base = { service_secret: "secret", idToken: "token", request_id: "REQ-1", applicant_internal_user_id: "U-1", approval_reviewer_internal_user_id: "U-L1", applicant_organization_version: 2, request_version: 1, decision: "承認" };
  const started = context.attendanceApprovalContract_({ ...base, phase: "authorize" });
  assert.equal(started.ok, true);
  const finalized = context.attendanceApprovalContract_({ ...base, phase: "finalize", authorization_event_id: started.authorization_event_id, reviewer_internal_user_id: "U-L1", result: "success", result_status: "承認済み" });
  assert.equal(finalized.ok, true);
  assert.deepEqual(logs.map(log => log.result), ["started", "success"]);
  assert.equal(logs[0].authorization_event_id, logs[1].authorization_event_id);
  const rejected = context.attendanceApprovalContract_({ ...base, phase: "authorize", approval_reviewer_internal_user_id: "U-L2" });
  assert.equal(rejected.code, "NOT_ASSIGNED_REVIEWER");
  assert.equal(logs.at(-1).result, "rejected");
});

test("既存終端と異なるfinalize要求は復旧記録を残す", () => {
  const recoveries = [];
  const context = {
    console,
    normalizeText: value => String(value ?? "").trim(),
    findAttendanceApprovalTerminal_: () => "success",
    recordAuthorizationRecovery_: item => recoveries.push(item)
  };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  context.findAttendanceApprovalTerminal_ = () => "success";
  context.recordAuthorizationRecovery_ = item => recoveries.push(item);
  const result = context.finalizeAttendanceApprovalReviewLocked_({ authorization_event_id: "ACE-1", request_id: "REQ-1", result: "error" });
  assert.equal(result.code, "EVENT_ALREADY_FINALIZED");
  assert.equal(recoveries[0].error_code, "TERMINAL_RESULT_CONFLICT");
  assert.equal(recoveries[0].authorization_event_id, "ACE-1");
  assert.equal(recoveries[0].request_id, "REQ-1");
  assert.equal(recoveries[0].source, "attendance");
  assert.equal(recoveries[0].existing_result, "success");
  assert.equal(recoveries[0].requested_result, "error");
});

test("finalizeは承認者解決をScript Lock取得前に完了する", () => {
  let lockHeld = false;
  const logs = [];
  const context = {
    normalizeText: value => String(value ?? "").trim(),
    LockService: { getScriptLock: () => ({ waitLock: () => { lockHeld = true; }, releaseLock: () => { lockHeld = false; } }) },
    resolveAttendanceReviewer_: () => { assert.equal(lockHeld, false); return { internal_user_id: "U-L1" }; },
    findAttendanceApprovalTerminal_: () => { assert.equal(lockHeld, true); return ""; },
    appendAuthorizationChangeLog_: entry => { assert.equal(lockHeld, true); logs.push(entry); return entry; },
    recordAuthorizationRecovery_: () => assert.fail("recovery must not be used")
  };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  context.resolveAttendanceReviewer_ = () => { assert.equal(lockHeld, false); return { internal_user_id: "U-L1" }; };
  context.findAttendanceApprovalTerminal_ = () => { assert.equal(lockHeld, true); return ""; };
  const result = context.finalizeAttendanceApprovalReview_({ authorization_event_id: "ACE-1", reviewer_internal_user_id: "U-SAVED", idToken: "token", result: "success", request_version: 1 });
  assert.equal(result.ok, true);
  assert.equal(logs[0].reviewer_internal_user_id, "U-L1");
  assert.equal(lockHeld, false);
});

test("同一利用者による同一申請の割当外試行は短時間に1件だけ監査記録する", () => {
  const logs = [];
  const cacheValues = new Map();
  let lockHeld = false;
  const context = {
    normalizeText: value => String(value ?? "").trim(),
    CacheService: { getScriptCache: () => ({ get: key => cacheValues.get(key), put: (key, value) => cacheValues.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { lockHeld = true; }, releaseLock: () => { lockHeld = false; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
      computeDigest: (_algorithm, source) => Array.from(String(source), character => character.charCodeAt(0)),
      base64EncodeWebSafe: digest => digest.join("-")
    },
    appendAuthorizationChangeLog_: entry => { assert.equal(lockHeld, true); logs.push(entry); return entry; }
  };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  const entry = { request_id: "REQ-1", actor_internal_user_id: "U-X", error_code: "NOT_ASSIGNED_REVIEWER" };
  context.appendAttendanceRejectionLog_(entry);
  context.appendAttendanceRejectionLog_(entry);
  assert.equal(logs.length, 1);
  assert.equal(lockHeld, false);
});

test("拒否抑制キャッシュが利用不能でも監査ログを記録する", () => {
  const logs = [];
  let lockHeld = false;
  const context = {
    normalizeText: value => String(value ?? "").trim(),
    CacheService: { getScriptCache: () => { throw new Error("cache unavailable"); } },
    LockService: { getScriptLock: () => ({ waitLock: () => { lockHeld = true; }, releaseLock: () => { lockHeld = false; } }) },
    Utilities: {},
    appendAuthorizationChangeLog_: entry => { assert.equal(lockHeld, true); logs.push(entry); return entry; }
  };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  context.appendAttendanceRejectionLog_({ request_id: "REQ-1", actor_internal_user_id: "U-X", error_code: "NOT_ASSIGNED_REVIEWER" });
  assert.equal(logs.length, 1);
  assert.equal(lockHeld, false);
});

test("承認終端検索は監査ログ全件読込みを使わずイベントID列を完全一致検索する", () => {
  const searched = [];
  const finderOptions = [];
  const ranges = {
    header: { getDisplayValues: () => [["authorization_event_id", "result"]] },
    events: { createTextFinder: eventId => {
      searched.push(eventId);
      const finder = {
        matchEntireCell: exact => { finderOptions.push(["entire", exact]); return finder; },
        matchCase: exact => { finderOptions.push(["case", exact]); return finder; },
        findAll: () => [{ getRow: () => 3 }, { getRow: () => 2 }]
      };
      return finder;
    } },
    result2: { getDisplayValue: () => "success" },
    result3: { getDisplayValue: () => "started" }
  };
  const sheet = {
    getLastRow: () => 3,
    getLastColumn: () => 2,
    getDataRange: () => assert.fail("full log read must not be used"),
    getRange: (row, column, rowCount, columnCount) => {
      if (row === 1) return ranges.header;
      if (row === 2 && column === 1 && rowCount === 2 && columnCount === 1) return ranges.events;
      if (row === 2 && column === 2) return ranges.result2;
      if (row === 3 && column === 2) return ranges.result3;
      assert.fail(`unexpected range ${row},${column},${rowCount},${columnCount}`);
    }
  };
  const context = { normalizeText: value => String(value ?? "").trim(), getAuthorizationChangeLogsSheet_: () => sheet, organizationAuthorizationError_: code => Object.assign(new Error(code), { code }) };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  assert.equal(context.findAttendanceApprovalTerminal_("ACE-1"), "success");
  assert.deepEqual(searched, ["ACE-1"]);
  assert.deepEqual(finderOptions, [["entire", true], ["case", true]]);
});
