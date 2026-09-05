import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const backendSource = readFileSync(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8");

test("共通ログイン応答へ既存のShiftBuilder権限を返す", () => {
  const source = readFileSync(new URL("../backend/account-apps-script/users.js", import.meta.url), "utf8");
  const context = vm.createContext({ buildPmoV2Url: () => "", console });
  vm.runInContext(source, context);
  const result = context.buildLoginUserResponse({
    email: "member@example.com",
    status: "active",
    base_area: "関西",
    allowed_modules: "shift",
    shiftbuilder_permission: "view"
  });
  assert.equal(result.shiftbuilder_permission, "view");
  assert.equal(result.base_area, "関西");
});

function createSheet(initialRows = []) {
  const values = initialRows.map(row => row.slice());
  const ensureCell = (row, column) => {
    while (values.length <= row) values.push([]);
    while (values[row].length <= column) values[row].push("");
  };
  return {
    values,
    appendRow: row => values.push(row.slice()),
    getDataRange: () => ({ getValues: () => values.map(row => row.slice()) }),
    getLastColumn: () => Math.max(1, ...values.map(row => row.length)),
    getLastRow: () => values.length,
    deleteRow: row => values.splice(row - 1, 1),
    getRange: (row, column, rowCount = 1, columnCount = 1) => ({
      getValues: () => Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => values[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? "")),
      setValue: value => { ensureCell(row - 1, column - 1); values[row - 1][column - 1] = value; },
      setValues: rows => rows.forEach((sourceRow, rowOffset) => sourceRow.forEach((value, columnOffset) => { ensureCell(row - 1 + rowOffset, column - 1 + columnOffset); values[row - 1 + rowOffset][column - 1 + columnOffset] = value; }))
    }),
    setFrozenRows: () => {}
  };
}

function createAttendanceContext(records, { provision = true } = {}) {
  let uuid = 0;
  const sheets = {
    "勤怠記録": createSheet([
      ["record_id", "email", "氏名", "勤務日", "予定場所", "開発予定ID", "状態", "実終了", "正式終了", "schedule_id"],
      ...records.map(record => [record.record_id, record.email, record.name || "担当者", record.workDate || "2026-08-28", record.storeName || "店舗A", record.planId || "PLAN-1", record.status || "終了済み", record.actualEnd === undefined ? (record.status === "稼働中" ? "" : "2026-08-28T18:00:00+09:00") : record.actualEnd, record.formalEnd || "", record.scheduleId || ""])
    ]),
    "実績報告": createSheet([["report_id", "record_id", "開発予定ID", "開発予定名", "報告者メール", "報告者氏名", "実績内容", "課題・申し送り", "報告日時"]]),
    "実績テンプレート": createSheet([
      ["template_id", "テンプレート名", "有効", "作成日時", "更新日時"],
      ["docomo", "ドコモ案件", true, "", ""]
    ]),
    "実績対象案件": createSheet([
      ["mapping_id", "開発予定ID", "開発予定名", "template_id", "有効", "作成日時", "更新日時"],
      ["MAP-1", "PLAN-1", "案件1", "docomo", true, "", ""]
    ]),
    "通知": createSheet([["notification_id", "宛先メール", "宛先氏名", "種別", "タイトル", "本文", "対象ID", "既読", "送信状態", "作成日時", "既読日時"]])
  };
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => (sheets[name] = createSheet())
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActive: () => spreadsheet },
    Utilities: {
      getUuid: () => `UUID-${++uuid}`,
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (_algorithm, value) => Array.from(String(value), character => character.charCodeAt(0)),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString("base64url"),
      formatDate: (date, _tz, format) => format === "yyyy-MM-dd" ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "2026/08/28 18:00"
    },
    LockService: {
      getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
    },
    console
  });
  vm.runInContext(backendSource, context);
  if (provision) context.setupWorkReportData_({ email: "admin@example.com", role: "admin" });
  return { context, sheets, spreadsheet };
}

function validAnswers() {
  return [
    { itemId: "responseCount", value: 0 },
    { itemId: "successfulActions", value: "声かけを工夫した" },
    { itemId: "measuresAndResults", value: "導線を変えて改善した" }
  ];
}

function operationId(token) {
  return `${token}-operation-id-0001`;
}

function reportPayload(recordId, token = `TOKEN-${recordId}`, expectedVersion = 0) {
  return { recordId, answers: validAnswers(), operationId: operationId(token), expectedVersion };
}

test("実績報告はログイン本人の終了済み勤怠だけ受け付ける", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-1", email: " Member@Example.com " }]);
  const result = context.submitReport_({ email: "member@example.com", name: "担当者" }, reportPayload("REC-1"));
  assert.equal(result.ok, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("実績報告は他人・存在しない勤怠記録を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-OTHER", email: "other@example.com" }]);
  for (const recordId of ["REC-OTHER", "REC-MISSING"]) {
    assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload(recordId)), error => error.code === "REPORT_RECORD_FORBIDDEN");
  }
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("稼働終了前の実績報告を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-RUNNING", email: "member@example.com", status: "稼働中" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-RUNNING")), error => error.code === "REPORT_CLOCK_OUT_REQUIRED");
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("同じ勤怠記録の実績報告は再送しても二重登録しない", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-1", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-1", "FIRST"));
  const duplicate = context.submitReport_({ email: "member@example.com" }, reportPayload("REC-1", "RELOAD", 1));
  assert.equal(duplicate.duplicate, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("同じ再送トークンへ異なる回答を混ぜる操作を拒否する", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-TOKEN", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-TOKEN", "FIXED-TOKEN"));
  const changedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 9 } : answer);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, { recordId: "REC-TOKEN", answers: changedAnswers, operationId: operationId("FIXED-TOKEN"), expectedVersion: 0 }), error => error.code === "REPORT_SUBMISSION_RETRY_MISMATCH");
});

test("送信operationIdは安全な形式だけを受け付け、同一操作を復旧できる", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-TOKEN-SAFE", email: "member@example.com" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, { ...reportPayload("REC-TOKEN-SAFE"), operationId: "=1+1" }), error => error.code === "REPORT_OPERATION_ID_INVALID");
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-TOKEN-SAFE", "SAFE-TOKEN"));
  const revisionHeaders = sheets["実績報告改訂"].values[0];
  const storedToken = sheets["実績報告改訂"].values[1][revisionHeaders.indexOf("submission_token")];
  assert.equal(storedToken, operationId("SAFE-TOKEN"));

  const reportHeaders = sheets["実績報告"].values[0];
  sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")] = "保存中";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_id")] = "";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_number")] = 0;
  sheets["実績報告改訂"].values[1][revisionHeaders.indexOf("状態")] = "保存中";
  const restored = context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-TOKEN-SAFE" });
  assert.equal(restored.resumeOperationId, storedToken);
  const recovered = context.submitReport_({ email: "member@example.com" }, { ...reportPayload("REC-TOKEN-SAFE"), operationId: restored.resumeOperationId });
  assert.equal(recovered.ok, true);
  assert.equal(sheets["実績報告改訂"].values.length, 2);
});

test("対象案件マスターにない終了済み勤怠は実績報告を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-OTHER-PLAN", email: "member@example.com", planId: "PLAN-OTHER" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-OTHER-PLAN")), error => error.code === "REPORT_NOT_REQUIRED");
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("本人修正と差戻し後再提出は旧版回答を残して最新版だけを切り替える", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-EDIT", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com", name: "担当者" }, reportPayload("REC-EDIT", "EDIT-1"));
  const changedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 4 } : answer);
  const edited = context.submitReport_({ email: "member@example.com", name: "担当者" }, { recordId: "REC-EDIT", answers: changedAnswers, operationId: operationId("EDIT-2"), expectedVersion: 1 });
  assert.equal(edited.revisionNumber, 2);
  const reportHeaders = sheets["実績報告"].values[0];
  const reportId = sheets["実績報告"].values[1][reportHeaders.indexOf("report_id")];
  context.returnWorkReport_({ email: "admin@example.com", role: "admin" }, { reportId, reason: "応対数を再確認してください", operationId: operationId("RETURN-EDIT-2"), expectedVersion: 2 });
  const revisionHeaders = sheets["実績報告改訂"].values[0];
  const returnedRevision = sheets["実績報告改訂"].values[2];
  assert.equal(returnedRevision[revisionHeaders.indexOf("差戻し理由")], "応対数を再確認してください");
  assert.ok(returnedRevision[revisionHeaders.indexOf("差戻し日時")]);
  const resubmittedAnswers = changedAnswers.map(answer => answer.itemId === "responseCount" ? { ...answer, value: 5 } : answer);
  const resubmitted = context.submitReport_({ email: "member@example.com", name: "担当者" }, { recordId: "REC-EDIT", answers: resubmittedAnswers, operationId: operationId("EDIT-3"), expectedVersion: 2 });
  assert.equal(resubmitted.revisionNumber, 3);
  assert.equal(sheets["実績報告改訂"].values.length, 4);
  assert.deepEqual(sheets["実績報告改訂"].values.slice(1).map(row => row[revisionHeaders.indexOf("編集種別")]), ["初回提出", "本人修正", "差戻し後再提出"]);
  const answerHeaders = sheets["実績回答"].values[0];
  const responseRows = sheets["実績回答"].values.slice(1).filter(row => row[answerHeaders.indexOf("item_id")] === "responseCount");
  assert.deepEqual(responseRows.map(row => row[answerHeaders.indexOf("数値回答")]), [0, 4, 5]);

  const form = context.getWorkReportForm_({ email: "member@example.com", name: "担当者" }, { recordId: "REC-EDIT" });
  assert.deepEqual(Array.from(form.revisions, revision => revision.revisionNumber), [3, 2, 1]);
  assert.deepEqual(Array.from(form.revisions, revision => revision.answers.find(answer => answer.itemId === "responseCount").value), [5, 4, 0]);
  assert.equal(form.revisions.find(revision => revision.revisionNumber === 2).returnReason, "応対数を再確認してください");
  assert.throws(() => context.getWorkReportForm_({ email: "other@example.com" }, { recordId: "REC-EDIT" }), error => error.code === "REPORT_RECORD_FORBIDDEN");

  // 新しい履歴列が追加される前の差戻しは、本人宛て通知から理由を復元する。
  returnedRevision[revisionHeaders.indexOf("差戻し理由")] = "";
  returnedRevision[revisionHeaders.indexOf("差戻し日時")] = "";
  const submittedAtColumn = revisionHeaders.indexOf("提出日時");
  sheets["実績報告改訂"].values[1][submittedAtColumn] = new Date("2026-08-28T10:00:00+09:00");
  sheets["実績報告改訂"].values[2][submittedAtColumn] = new Date("2026-08-28T11:00:00+09:00");
  sheets["実績報告改訂"].values[3][submittedAtColumn] = new Date("2026-08-28T12:00:00+09:00");
  const notificationHeaders = sheets["通知"].values[0];
  sheets["通知"].values[1][notificationHeaders.indexOf("作成日時")] = new Date("2026-08-28T11:30:00+09:00");
  const legacyForm = context.getWorkReportForm_({ email: "member@example.com", name: "担当者" }, { recordId: "REC-EDIT" });
  assert.equal(legacyForm.revisions.find(revision => revision.revisionNumber === 2).returnReason, "応対数を再確認してください");
});

test("差戻し後の古い操作再送は差戻しを解除せず、再読込後の新操作だけ受け付ける", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-RETURN-SAFE", email: "member@example.com" }]);
  const firstPayload = reportPayload("REC-RETURN-SAFE", "RETURN-SAFE-1");
  const first = context.submitReport_({ email: "member@example.com", name: "担当者" }, firstPayload);
  const returnPayload = { reportId: first.reportId, reason: "内容を再確認してください", operationId: operationId("RETURN-SAFE-REJECT"), expectedVersion: 1 };
  context.returnWorkReport_({ email: "admin@example.com", role: "admin" }, returnPayload);
  const duplicateReturn = context.returnWorkReport_({ email: "admin@example.com", role: "admin" }, returnPayload);
  assert.equal(duplicateReturn.duplicate, true);
  assert.equal(sheets["通知"].values.filter(row => row[sheets["通知"].values[0].indexOf("種別")] === "実績報告の差戻し").length, 1);

  assert.throws(
    () => context.submitReport_({ email: "member@example.com", name: "担当者" }, firstPayload),
    error => error.code === "REPORT_RETURNED_RELOAD_REQUIRED"
  );
  const reportHeaders = sheets["実績報告"].values[0];
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")], "差戻し中");

  const correctedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 2 } : answer);
  const corrected = context.submitReport_({ email: "member@example.com", name: "担当者" }, {
    recordId: "REC-RETURN-SAFE",
    answers: correctedAnswers,
    operationId: operationId("RETURN-SAFE-2"),
    expectedVersion: 1
  });
  assert.equal(corrected.revisionNumber, 2);
});

test("本人送信と管理者差戻しは古いexpectedVersionを拒否する", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-VERSION", email: "member@example.com" }]);
  const first = context.submitReport_({ email: "member@example.com" }, reportPayload("REC-VERSION", "VERSION-1"));
  const changedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 3 } : answer);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, {
    recordId: "REC-VERSION", answers: changedAnswers, operationId: operationId("VERSION-STALE"), expectedVersion: 0
  }), error => error.code === "REPORT_VERSION_CONFLICT");
  assert.throws(() => context.returnWorkReport_({ email: "admin@example.com", role: "admin" }, {
    reportId: first.reportId, reason: "古い画面", operationId: operationId("RETURN-STALE"), expectedVersion: 0
  }), error => error.code === "REPORT_VERSION_CONFLICT");
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, {
    ...reportPayload("REC-VERSION", "VERSION-NULL"), expectedVersion: null
  }), error => error.code === "REPORT_EXPECTED_VERSION_INVALID");
});

test("通信断相当の保存中報告は不足回答だけを補完して完了する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-RETRY", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-RETRY", "RETRY-TOKEN"));
  const reportHeaders = sheets["実績報告"].values[0];
  sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")] = "保存中";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_id")] = "";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_number")] = 0;
  const revisionHeaders = sheets["実績報告改訂"].values[0];
  sheets["実績報告改訂"].values[1][revisionHeaders.indexOf("状態")] = "保存中";
  sheets["実績回答"].values.pop();
  const restored = context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-RETRY" });
  assert.equal(restored.resuming, true);
  assert.equal(restored.resumeOperationId, operationId("RETRY-TOKEN"));
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-RETRY", "NEW-TOKEN")), error => error.code === "REPORT_SUBMISSION_IN_PROGRESS");
  const retry = context.submitReport_({ email: "member@example.com" }, { ...reportPayload("REC-RETRY"), operationId: restored.resumeOperationId });
  assert.equal(retry.ok, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")], "提出済み");
});

test("回答版の確定直後に通信が切れても同じ送信で報告ヘッダーを復旧する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-FINALIZE", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-FINALIZE", "FINALIZE-TOKEN"));
  const reportHeaders = sheets["実績報告"].values[0];
  const revisionHeaders = sheets["実績報告改訂"].values[0];
  const revisionId = sheets["実績報告改訂"].values[1][revisionHeaders.indexOf("revision_id")];
  sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")] = "保存中";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_id")] = "";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_number")] = 0;
  const restored = context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-FINALIZE" });
  assert.equal(restored.resuming, true);
  assert.equal(restored.resumeOperationId, operationId("FINALIZE-TOKEN"));
  const recovered = context.submitReport_({ email: "member@example.com" }, { ...reportPayload("REC-FINALIZE"), operationId: restored.resumeOperationId });
  assert.equal(recovered.duplicate, true);
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")], "提出済み");
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_id")], revisionId);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("承認済みの正式終了があれば実績報告できる", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-CORRECTED", email: "member@example.com", status: "修正済み", actualEnd: "", formalEnd: "2026-08-28T18:00:00+09:00" }]);
  assert.equal(context.submitReport_({ email: "member@example.com" }, reportPayload("REC-CORRECTED")).ok, true);
});

test("個人成績APIはログイン本人の対象勤怠と回答だけを返す", () => {
  const { context } = createAttendanceContext([
    { record_id: "REC-ME", email: "member@example.com", workDate: "2026-08-28" },
    { record_id: "REC-OTHER", email: "other@example.com", workDate: "2026-08-28" }
  ]);
  const myAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 3 } : answer);
  const otherAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 99 } : answer);
  context.submitReport_({ email: "member@example.com", name: "本人" }, { recordId: "REC-ME", answers: myAnswers, operationId: operationId("MY-SUMMARY"), expectedVersion: 0 });
  context.submitReport_({ email: "other@example.com", name: "他人" }, { recordId: "REC-OTHER", answers: otherAnswers, operationId: operationId("OTHER-SUMMARY"), expectedVersion: 0 });
  const summary = context.getMyWorkReportSummary_({ email: "member@example.com" }, { month: "2026-08" });
  assert.equal(summary.ownerEmail, "member@example.com");
  assert.equal(summary.counts.total, 1);
  assert.equal(summary.metrics.find(metric => metric.itemId === "responseCount").value, 3);
  assert.deepEqual(Array.from(summary.submissions, item => item.recordId), ["REC-ME"]);
  assert.equal(typeof summary.serverTiming.totalMs, "number");
});

test("個人成績の読取経路ではシート整備とDocument Lockを実行しない", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-READ-ONLY", email: "member@example.com", workDate: "2026-08-28" }]);
  context.ensureWorkReportSheetsWithLock_ = () => { throw new Error("read path must not ensure sheets"); };
  const summary = context.getMyWorkReportSummary_({ email: "member@example.com" }, { month: "2026-08" });
  assert.equal(summary.ownerEmail, "member@example.com");
  assert.equal(summary.counts.total, 1);
});

test("初期表示APIは認証を含む処理時間と予定同期キャッシュ状態を返す", () => {
  const { context } = createAttendanceContext([]);
  context.resolveUser_ = () => ({ email: "member@example.com" });
  context.jsonOutput_ = value => value;
  context.getDashboardData_ = () => ({ ok: true, _serverTiming: { referenceMs: 12, recordsMs: 3, assembleMs: 1, referenceCache: "hit", recordsCache: "hit" } });
  context.dashboardScheduleSyncStatus_ = () => ({ status: "fresh-cache", syncedAt: "2026-08-31T00:00:00+09:00" });
  const dashboard = context.doPost({ postData: { contents: JSON.stringify({ action: "getDashboardData", idToken: "TOKEN", payload: {} }) } });
  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.scheduleSync.status, "fresh-cache");
  assert.equal(typeof dashboard.serverTiming.authMs, "number");
  assert.equal(dashboard.serverTiming.referenceMs, 12);
  assert.equal(dashboard.serverTiming.recordsMs, 3);
  assert.equal(dashboard.serverTiming.referenceCache, "hit");
  assert.equal(dashboard.serverTiming.recordsCache, "hit");
  assert.equal(typeof dashboard.serverTiming.dashboardMs, "number");
  assert.equal(typeof dashboard.serverTiming.totalMs, "number");
  assert.equal(dashboard._serverTiming, undefined);

  context.getMyWorkReportSummary_ = () => ({ ok: true, serverTiming: { totalMs: 25 } });
  const summary = context.doPost({ postData: { contents: JSON.stringify({ action: "getMyWorkReportSummary", idToken: "TOKEN", payload: {} }) } });
  assert.equal(summary.serverTiming.summaryMs, 25);
  assert.equal(typeof summary.serverTiming.authMs, "number");
  assert.equal(typeof summary.serverTiming.totalMs, "number");
});

test("ポータル初期表示は勤怠と個人成績を一括取得し、成績失敗時も勤怠を返す", () => {
  const { context } = createAttendanceContext([]);
  context.getDashboardData_ = () => ({ ok: true, today: "2026-08-28", marker: "dashboard" });
  context.getMyWorkReportSummary_ = () => ({ ok: true, ownerEmail: "member@example.com" });
  const success = context.getPortalBootstrap_({ email: "member@example.com" }, { month: "2026-08" });
  assert.equal(success.marker, "dashboard");
  assert.equal(success.workReportSummary.ownerEmail, "member@example.com");
  assert.equal(success.workReportSummaryError, null);
  assert.equal(typeof success.serverTiming.totalMs, "number");

  context.getMyWorkReportSummary_ = () => { throw context.apiError_("SUMMARY_FAILED", "成績集計に失敗"); };
  const partial = context.getPortalBootstrap_({ email: "member@example.com" }, { month: "2026-08" });
  assert.equal(partial.marker, "dashboard");
  assert.equal(partial.workReportSummary, null);
  assert.equal(partial.workReportSummaryError.code, "SUMMARY_FAILED");
});

test("ポータル初期表示は大きいシートを同一リクエスト内で一度だけ読む", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-BOOTSTRAP", email: "member@example.com", workDate: "2026-08-28" }]);
  sheets["稼働予定"] = createSheet([
    ["schedule_id", "email", "勤務日", "開発予定ID", "開発予定名", "稼働場所"],
    ["SCH-BOOTSTRAP", "member@example.com", "2026-08-28", "PLAN-1", "案件1", "店舗A"]
  ]);
  sheets["現場報告"] = createSheet([["field_report_id", "勤務日", "開発予定ID", "報告種別", "報告者メール", "報告者氏名", "報告日時", "schedule_id"]]);
  sheets["設定"] = createSheet([["設定キー", "設定値"]]);
  sheets["実績項目"] = createSheet([
    ["item_id", "template_id", "項目名", "種別", "カテゴリID", "カテゴリ名", "表示順", "必須", "有効", "定義版", "ダッシュボード表示", "ダッシュボード名", "ダッシュボード順", "作成日時", "更新日時"],
    ["responseCount", "docomo", "応対数", "number", "basic", "基本情報", 10, true, true, 1, true, "応対数", 10, "", ""]
  ]);
  const rowReads = Object.create(null);
  const readRows = context.rows_;
  context.rows_ = name => {
    rowReads[name] = (rowReads[name] || 0) + 1;
    return readRows(name);
  };

  const result = context.getPortalBootstrap_({ email: "member@example.com", name: "本人", role: "developer" }, { month: "2026-08" });
  assert.equal(result.ok, true);
  for (const sheetName of ["稼働予定", "勤怠記録", "実績テンプレート", "実績項目"]) {
    assert.equal(rowReads[sheetName], 1, sheetName);
  }
});

test("勤怠ダッシュボードは本人の読取データを再利用し、打刻後の無効化で全件再読込する", () => {
  const { context } = createAttendanceContext([]);
  const cacheValues = new Map();
  const cacheTtls = new Map();
  context.CacheService = { getScriptCache: () => ({
    get: key => cacheValues.get(key) || null,
    put: (key, value, ttl) => { cacheValues.set(key, value); cacheTtls.set(key, ttl); },
    remove: key => cacheValues.delete(key)
  }) };
  const rowReads = Object.create(null);
  const values = {
    "稼働予定": [{ schedule_id: "S1", email: "member@example.com", "勤務日": "2026-08-31", "予定開始": "09:00", "予定終了": "18:00" }],
    "勤怠記録": [],
    "現場報告": [],
    "通知": [],
    "設定": []
  };
  context.rows_ = name => {
    rowReads[name] = (rowReads[name] || 0) + 1;
    return values[name] || [];
  };
  const user = { email: "member@example.com", name: "本人", role: "developer" };

  const first = context.getDashboardData_(user);
  const second = context.getDashboardData_(user);
  assert.equal(first._serverTiming.referenceCache, "miss");
  assert.equal(second._serverTiming.referenceCache, "hit");
  assert.equal(first._serverTiming.recordsCache, "miss");
  assert.equal(second._serverTiming.recordsCache, "hit");
  assert.ok(Array.from(cacheTtls.entries()).some(([key, ttl]) => key.includes("dashboard-records") && ttl === 900));
  for (const sheetName of ["稼働予定", "現場報告", "通知", "設定"]) assert.equal(rowReads[sheetName], 1, sheetName);
  assert.equal(rowReads["勤怠記録"], 1);

  context.invalidateDashboardReferenceCache_(user);
  const third = context.getDashboardData_(user);
  assert.equal(third._serverTiming.referenceCache, "miss");
  assert.equal(third._serverTiming.recordsCache, "miss");
  assert.equal(rowReads["稼働予定"], 2);
  assert.equal(rowReads["勤怠記録"], 2);
});

test("勤怠キャッシュの本人識別子は32bitハッシュではなくSHA-256を使用する", () => {
  const { context } = createAttendanceContext([]);
  const identity = context.dashboardCacheIdentity_("Member@example.com");
  assert.equal(identity, Buffer.from("member@example.com").toString("base64url"));
  assert.doesNotMatch(backendSource, /Math\.imul|>>>\s*0/);
  assert.match(backendSource, /DigestAlgorithm\.SHA_256/);
});

test("読取専用認証だけ15分再利用し、打刻などの書込認証は毎回確認する", () => {
  const { context } = createAttendanceContext([]);
  const cacheValues = new Map();
  const cacheTtls = new Map();
  context.CacheService = { getScriptCache: () => ({
    get: key => cacheValues.get(key) || null,
    put: (key, value, ttl) => { cacheValues.set(key, value); cacheTtls.set(key, ttl); },
    remove: key => cacheValues.delete(key)
  }) };
  context.Utilities.DigestAlgorithm = { SHA_256: "SHA_256" };
  context.Utilities.Charset = { UTF_8: "UTF_8" };
  context.Utilities.computeDigest = (_algorithm, value) => Array.from(String(value), character => character.charCodeAt(0));
  context.Utilities.base64EncodeWebSafe = bytes => Buffer.from(bytes).toString("base64url");
  let fetchCalls = 0;
  context.UrlFetchApp = { fetch: () => ({ getContentText: () => (fetchCalls += 1, JSON.stringify({ ok: true, user: { email: "member@example.com", role: "member" } })) }) };

  context.resolveUser_("TOKEN", { allowReadCache: true });
  context.resolveUser_("TOKEN", { allowReadCache: true });
  context.resolveUser_("TOKEN");
  assert.equal(fetchCalls, 2);
  assert.ok(Array.from(cacheTtls.entries()).some(([key, ttl]) => key.includes("dashboard-auth") && ttl === 900));
});

test("背景予定同期は成功後5分の印だけを共有し、予定本体は勤怠シートから再読込する", () => {
  const { context } = createAttendanceContext([]);
  const cacheValues = new Map();
  context.CacheService = { getScriptCache: () => ({
    get: key => cacheValues.get(key) || null,
    put: (key, value) => cacheValues.set(key, value),
    remove: key => cacheValues.delete(key)
  }) };
  context.rows_ = () => [{ schedule_id: "LOCAL" }];
  let syncCalls = 0;
  context.syncSchedules_ = () => ({ schedules: [{ schedule_id: `SYNC-${++syncCalls}` }], synced: true });

  const first = context.getDashboardSchedules_("token");
  const second = context.getDashboardSchedules_("token");
  assert.equal(first.sync.status, "refreshed");
  assert.equal(first.schedules[0].schedule_id, "SYNC-1");
  assert.equal(second.sync.status, "fresh-cache");
  assert.equal(second.schedules[0].schedule_id, "LOCAL");
  assert.equal(syncCalls, 1);
  assert.equal(context.dashboardScheduleSyncStatus_().status, "fresh-cache");
  assert.ok(Array.from(cacheValues.values()).every(value => !value.includes("SYNC-1") && !value.includes("LOCAL")));
});

test("案件更新後の強制同期は5分キャッシュが残っていても最新予定を取得する", () => {
  const { context } = createAttendanceContext([]);
  const cacheValues = new Map();
  context.CacheService = { getScriptCache: () => ({
    get: key => cacheValues.get(key) || null,
    put: (key, value) => cacheValues.set(key, value),
    remove: key => cacheValues.delete(key)
  }) };
  context.rows_ = () => [{ schedule_id: "LOCAL" }];
  let syncCalls = 0;
  context.syncSchedules_ = () => ({ schedules: [{ schedule_id: `SYNC-${++syncCalls}` }], synced: true });

  context.markDashboardScheduleSyncFresh_();
  const forced = context.getDashboardSchedules_("token", { forceRefresh: true, sourceRevision: "REV-1" });
  const repeated = context.getDashboardSchedules_("token", { forceRefresh: true, sourceRevision: "REV-1" });

  assert.equal(forced.sync.status, "refreshed");
  assert.equal(forced.schedules[0].schedule_id, "SYNC-1");
  assert.equal(repeated.sync.status, "fresh-cache");
  assert.equal(syncCalls, 1);
});

test("予定同期キャッシュがなければ初期応答は外部同期を実行せずstaleを返す", () => {
  const { context } = createAttendanceContext([]);
  let syncCalls = 0;
  context.syncSchedules_ = () => { syncCalls += 1; return { schedules: [], synced: true }; };
  assert.equal(context.dashboardScheduleSyncStatus_().status, "stale");
  assert.equal(syncCalls, 0);
});

test("背景予定同期の失敗は印を消して次回再試行できる", () => {
  const { context } = createAttendanceContext([]);
  const cacheValues = new Map();
  context.CacheService = { getScriptCache: () => ({
    get: key => cacheValues.get(key) || null,
    put: (key, value) => cacheValues.set(key, value),
    remove: key => cacheValues.delete(key)
  }) };
  context.rows_ = () => [{ schedule_id: "LOCAL" }];
  let syncCalls = 0;
  context.syncSchedules_ = () => ({ schedules: [{ schedule_id: "LOCAL" }], synced: (++syncCalls, false) });
  assert.equal(context.getDashboardSchedules_("token").sync.status, "failed");
  assert.equal(context.getDashboardSchedules_("token").sync.status, "failed");
  assert.equal(syncCalls, 2);
  assert.equal(cacheValues.size, 0);
});

test("ShiftBuilder同期は解除済み予定と重複を除去し、勤怠参照済み予定は残す", () => {
  const { context, sheets } = createAttendanceContext([]);
  const headers = ["schedule_id", "employee_code", "氏名", "勤務日", "予定開始", "予定終了", "稼働場所", "開発予定ID", "開発予定名", "更新日時"];
  sheets["稼働予定"] = createSheet([
    headers,
    ["SA-LIVE", "U001", "担当者", "2026-09-05", "10:00", "18:00", "店舗A", "CASE-1", "案件1", ""],
    ["SA-LIVE", "U001", "担当者", "2026-09-05", "10:00", "18:00", "店舗A", "CASE-1", "案件1", ""],
    ["SA-REMOVED", "U001", "担当者", "2026-09-06", "10:00", "18:00", "店舗B", "CASE-2", "案件2", ""],
    ["SA-PROTECTED", "U001", "担当者", "2026-09-07", "10:00", "18:00", "店舗C", "CASE-3", "案件3", ""],
    ["MANUAL-1", "U001", "担当者", "2026-09-08", "10:00", "18:00", "店舗D", "CASE-4", "案件4", ""]
  ]);
  const recordHeaders = sheets["勤怠記録"].values[0];
  sheets["勤怠記録"].values.push(recordHeaders.map(header => header === "record_id" ? "REC-1" : header === "schedule_id" ? "SA-PROTECTED" : ""));

  const result = context.mergeSchedules_(context.rows_("稼働予定"), [{
    schedule_id: "SA-LIVE",
    employee_code: "U001",
    "氏名": "担当者",
    "勤務日": "2026-09-05",
    "予定開始": "10:05",
    "予定終了": "18:00",
    "稼働場所": "店舗A",
    "開発予定ID": "CASE-1",
    "開発予定名": "案件1"
  }], "2026-09");

  const ids = sheets["稼働予定"].values.slice(1).map(row => row[0]);
  assert.deepEqual(ids, ["SA-LIVE", "SA-PROTECTED", "MANUAL-1"]);
  assert.equal(result.filter(item => item.schedule_id === "SA-LIVE").length, 1);
  assert.equal(result.find(item => item.schedule_id === "SA-LIVE")["予定開始"], "10:05");
  assert.ok(result.find(item => item.schedule_id === "SA-LIVE")["更新日時"]);
  assert.ok(result.some(item => item.schedule_id === "SA-PROTECTED"));
});

test("CSVは通常出力で最新版だけ、履歴出力で修正前後を含める", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-CSV", email: "member@example.com", workDate: "2026-08-28" }]);
  context.submitReport_({ email: "member@example.com", name: "本人" }, reportPayload("REC-CSV", "CSV-1"));
  const changedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 7 } : answer);
  const changed = context.submitReport_({ email: "member@example.com", name: "本人" }, { recordId: "REC-CSV", answers: changedAnswers, operationId: operationId("CSV-2"), expectedVersion: 1 });
  context.returnWorkReport_({ email: "admin@example.com", role: "admin" }, { reportId: changed.reportId, reason: "集計値を確認してください", operationId: operationId("RETURN-CSV-2"), expectedVersion: 2 });
  context.submitReport_({ email: "member@example.com", name: "本人" }, { recordId: "REC-CSV", answers: changedAnswers, operationId: operationId("CSV-3"), expectedVersion: 2 });
  const filters = { dateFrom: "2026-08-01", dateTo: "2026-08-31", groupBy: "day" };
  const current = context.exportWorkReportsCsv_({ email: "admin@example.com", role: "admin" }, filters);
  const history = context.exportWorkReportsCsv_({ email: "admin@example.com", role: "admin" }, { ...filters, includeHistory: true });
  assert.ok(current.fileName.startsWith("work-reports_"));
  assert.ok(history.fileName.startsWith("work-reports-history_"));
  assert.equal(current.csv.split("\r\n").length, 40);
  assert.equal(history.csv.split("\r\n").length, 118);
  assert.ok(!current.csv.split("\r\n", 1)[0].includes("差戻し理由"));
  assert.ok(history.csv.split("\r\n", 1)[0].includes('"差戻し理由","差戻し日時"'));
  assert.ok(history.csv.includes('"集計値を確認してください"'));
  assert.match(history.csv, /"FALSE","集計値を確認してください","\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}"/);
  assert.ok(history.csv.includes('"初回提出"'));
  assert.ok(history.csv.includes('"本人修正"'));
  assert.ok(history.csv.includes('"差戻し後再提出"'));
});

test("案件の対象停止後も既存報告は履歴へ残し、新しい未提出勤怠だけ除外する", () => {
  const { context, sheets } = createAttendanceContext([
    { record_id: "REC-HISTORY", email: "member@example.com", workDate: "2026-08-27" },
    { record_id: "REC-AFTER-STOP", email: "member@example.com", workDate: "2026-08-28" }
  ]);
  context.submitReport_({ email: "member@example.com", name: "本人" }, reportPayload("REC-HISTORY", "HISTORY-1"));
  const mappingHeaders = sheets["実績対象案件"].values[0];
  sheets["実績対象案件"].values[1][mappingHeaders.indexOf("有効")] = false;
  const adminData = context.getWorkReportAdminData_({ email: "admin@example.com", role: "admin" }, { dateFrom: "2026-08-01", dateTo: "2026-08-31" });
  assert.deepEqual(Array.from(adminData.submissions, item => item.recordId), ["REC-HISTORY"]);
  const summary = context.getMyWorkReportSummary_({ email: "member@example.com" }, { month: "2026-08" });
  assert.deepEqual(Array.from(summary.submissions, item => item.recordId), ["REC-HISTORY"]);
  assert.equal(summary.submissions[0].editable, true);
  assert.equal(context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-HISTORY" }).ok, true);
});

test("案件の停止前未提出を残し、停止中を除外して再開後だけ再び対象にする", () => {
  const { context, sheets } = createAttendanceContext([
    { record_id: "REC-BEFORE", email: "member@example.com", workDate: "2026-08-28", actualEnd: "2026-08-28T18:00:00+09:00" },
    { record_id: "REC-PAUSED", email: "member@example.com", workDate: "2026-08-29", actualEnd: "2026-08-29T18:00:00+09:00" },
    { record_id: "REC-RESTARTED", email: "member@example.com", workDate: "2026-08-30", actualEnd: "2026-08-30T18:00:00+09:00" }
  ]);
  const mappingSheet = sheets["実績対象案件"];
  const headers = mappingSheet.values[0];
  const first = mappingSheet.values[1];
  first[headers.indexOf("有効")] = false;
  first[headers.indexOf("有効終了日時")] = "2026-08-28T23:00:00+09:00";
  first[headers.indexOf("更新日時")] = "2026-08-28T23:00:00+09:00";
  const restarted = {
    mapping_id: "MAP-2", "開発予定ID": "PLAN-1", "開発予定名": "案件1", template_id: "docomo", "有効": true,
    "有効開始日時": "2026-08-30T00:00:00+09:00", "有効終了日時": "", "作成日時": "2026-08-30T00:00:00+09:00", "更新日時": "2026-08-30T00:00:00+09:00"
  };
  mappingSheet.appendRow(headers.map(header => restarted[header] ?? ""));

  const adminData = context.getWorkReportAdminData_({ email: "admin@example.com", role: "admin" }, { dateFrom: "2026-08-01", dateTo: "2026-08-31" });
  assert.deepEqual(Array.from(adminData.submissions, item => item.recordId), ["REC-BEFORE", "REC-RESTARTED"]);
  const summary = context.getMyWorkReportSummary_({ email: "member@example.com" }, { month: "2026-08" });
  assert.deepEqual(Array.from(summary.submissions, item => item.recordId), ["REC-RESTARTED", "REC-BEFORE"]);
  assert.equal(context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-BEFORE" }).ok, true);
  assert.throws(() => context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-PAUSED" }), error => error.code === "REPORT_NOT_REQUIRED");
  assert.equal(context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-RESTARTED" }).ok, true);
});

test("案件の停止と再開は同じ行を上書きせず有効期間を履歴化する", () => {
  const { context, sheets } = createAttendanceContext([]);
  context.saveWorkReportCaseMapping_({ email: "admin@example.com", role: "admin" }, { planId: "PLAN-1", planName: "案件1", templateId: "docomo", active: false });
  const mappingSheet = sheets["実績対象案件"];
  const headers = mappingSheet.values[0];
  assert.equal(mappingSheet.values.length, 2);
  assert.equal(mappingSheet.values[1][headers.indexOf("有効")], false);
  assert.equal(Object.prototype.toString.call(mappingSheet.values[1][headers.indexOf("有効終了日時")]), "[object Date]");

  context.saveWorkReportCaseMapping_({ email: "admin@example.com", role: "admin" }, { planId: "PLAN-1", planName: "案件1", templateId: "docomo", active: true });
  assert.equal(mappingSheet.values.length, 3);
  assert.equal(mappingSheet.values[1][headers.indexOf("有効")], false);
  assert.equal(mappingSheet.values[2][headers.indexOf("有効")], true);
  assert.equal(Object.prototype.toString.call(mappingSheet.values[2][headers.indexOf("有効開始日時")]), "[object Date]");
});

test("本人確認前の不正な実績報告はシート作成や列追加を起こさない", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-OTHER", email: "other@example.com" }], { provision: false });
  const sheetNames = Object.keys(sheets);
  const reportHeaders = sheets["実績報告"].values[0].slice();
  assert.throws(() => context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-OTHER" }), error => error.code === "REPORT_RECORD_FORBIDDEN");
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-OTHER")), error => error.code === "REPORT_RECORD_FORBIDDEN");
  assert.deepEqual(Object.keys(sheets), sheetNames);
  assert.deepEqual(sheets["実績報告"].values[0], reportHeaders);
  assert.equal(sheets["実績回答"], undefined);
  assert.throws(() => context.setupWorkReportData_({ email: "member@example.com", role: "member" }), error => error.code === "FORBIDDEN");
  assert.equal(sheets["実績回答"], undefined);
  assert.equal(context.setupWorkReportData_({ email: "admin@example.com", role: "admin" }).ok, true);
  assert.ok(sheets["実績回答"]);
});

test("終了済み状態だけで終了時刻がなければ実績報告を拒否する", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-INCONSISTENT", email: "member@example.com", status: "終了済み", actualEnd: "", formalEnd: "" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-INCONSISTENT")), error => error.code === "REPORT_CLOCK_OUT_REQUIRED");
});

test("数値0と未入力を区別し、型変換で数値化できる不正値も拒否する", () => {
  const { context } = createAttendanceContext([]);
  const definitions = [
    { item_id: "required", "項目名": "必須件数", "種別": "number", "必須": true },
    { item_id: "optional", "項目名": "任意件数", "種別": "number", "必須": false }
  ];
  const normalized = context.normalizeWorkReportAnswers_(definitions, [{ itemId: "required", value: 0 }]);
  assert.equal(normalized[0].inputState, "answered");
  assert.equal(normalized[1].value, 0);
  assert.equal(normalized[1].inputState, "defaulted");
  for (const value of [-1, 1.5, "abc", true, [], {}, " ", "1e3", "0x10", "01", "+1"]) {
    assert.throws(() => context.normalizeWorkReportAnswers_(definitions, [{ itemId: "required", value }]), error => error.code === "REPORT_NUMBER_INVALID");
  }
  assert.equal(context.normalizeWorkReportAnswers_(definitions, [{ itemId: "required", value: "12" }])[0].value, 12);
});

test("CSVとシート保存値は改行・タブ・空白で隠した数式も無害化する", () => {
  const { context } = createAttendanceContext([]);
  for (const value of ["=1+1", "+1", "-1", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1"]) {
    assert.ok(context.sheetText_(value).startsWith("'"));
    assert.ok(context.csvCell_(value).startsWith('"\''));
  }
  assert.equal(context.sheetText_(" 通常の文章"), " 通常の文章");
});
