import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8");
function fixture() {
  let held = false;
  const calls = [];
  const lock = {
    waitLock() { assert.equal(held, false, "nested acquisition must reuse the lock"); held = true; calls.push("acquire"); },
    releaseLock() { assert.equal(held, true); held = false; calls.push("release"); }
  };
  const context = vm.createContext({ console, SpreadsheetApp: { flush() { assert.equal(held, true); } }, LockService: { getDocumentLock: () => null, getScriptLock: () => lock } });
  vm.runInContext(source, context);
  return { context, calls, isHeld: () => held };
}

test("Webアプリのdocument lockがnullでも保存用ロックを取得でき、入れ子でも外側を維持する", () => {
  const { context: c, calls, isHeld } = fixture();
  const outer = c.attendanceWriteLock_();
  const inner = c.attendanceWriteLock_();
  outer.waitLock(1000); inner.waitLock(1000); inner.releaseLock();
  assert.equal(isHeld(), true);
  outer.releaseLock(); inner.releaseLock();
  assert.deepEqual(calls, ["acquire", "release"]);
  assert.doesNotMatch(source, /getDocumentLock/);
});

test("ロック取得失敗後に次の保存がロックを省略しない", () => {
  const { context: c } = fixture();
  let attempts = 0;
  c.LockService.getScriptLock = () => ({ waitLock() { attempts++; throw new Error("BUSY"); }, releaseLock() {} });
  assert.throws(() => c.attendanceWriteLock_().waitLock(1), /BUSY/);
  assert.throws(() => c.attendanceWriteLock_().waitLock(1), /BUSY/);
  assert.equal(attempts, 2);
});

test("予定同期は最新行をロック内で読み、他の同期で行削除されても別予定を壊さない", () => {
  const { context: c, isHeld, calls } = fixture();
  const headers = ["schedule_id", "勤務日", "予定開始"];
  const a = { schedule_id: "SA-A", "勤務日": "2026-09-10", "予定開始": "09:00" };
  const b = { ...a, schedule_id: "SA-B" }, d = { ...a, schedule_id: "SA-C" };
  // 外部取得中に別同期がAを削除済み。空白行も配列上の位置に依存してはいけない。
  const rows = [headers, ["", "", ""], ["SA-B", "2026-09-10", "09:00"], ["SA-C", "2026-09-10", "09:00"]];
  const sheet = {
    getLastColumn: () => headers.length,
    getDataRange: () => ({ getValues: () => rows.map(row => [...row]) }),
    getRange: (row) => ({ getValues: () => [rows[row - 1]], setValues(values) { assert.equal(isHeld(), true); rows[row - 1] = values[0]; } })
  };
  c.SpreadsheetApp = { getActive: () => ({ getSheetByName: () => sheet }), flush: () => assert.equal(isHeld(), true) };
  const originalRows = c.rows_;
  c.rows_ = name => { assert.equal(isHeld(), true); return originalRows(name); };
  const result = c.mergeSchedules_([a, b, d], [{ ...b, "予定開始": "10:00" }, d], "2026-09");
  assert.equal(rows[2][0], "SA-B"); assert.equal(rows[2][2], "10:00");
  assert.equal(rows[3][0], "SA-C");
  assert.deepEqual(Array.from(result, r => r.schedule_id), ["SA-B", "SA-C"]);
  assert.deepEqual(calls, ["acquire", "release"]);
});

test("同期失敗でも外側の打刻ロックを途中解放しない", () => {
  const { context: c, calls, isHeld } = fixture();
  const outer = c.attendanceWriteLock_(); outer.waitLock(1000);
  c.rows_ = () => { throw new Error("READ_FAILED"); };
  assert.throws(() => c.mergeSchedules_([], [], "2026-09"), /READ_FAILED/);
  assert.equal(isHeld(), true);
  outer.releaseLock();
  assert.deepEqual(calls, ["acquire", "release"]);
});

test("勤怠予定は配置時刻を優先し、旧データだけ案件時刻へフォールバックする", () => {
  const { context: c } = fixture();
  c.Utilities = { formatDate: () => "2026-09" };
  c.UrlFetchApp = { fetch: () => ({ getContentText: () => JSON.stringify({ success: true, data: { cases: [{ caseId: "C1", cells: {
    "2026-09-10": { start_time: "10:00", end_time: "19:00", assigned: [
      { assignment_id: "SA-1", assignment_status: "published", start_time: "09:00", end_time: "18:00" },
      { assignment_id: "SA-2" },
      { assignment_id: "SA-3", startTime: "22:00", endTime: "01:00" }
    ] }
  } }] } }) }) };
  c.mergeSchedules_ = (_local, derived) => derived;
  const schedules = c.syncSchedules_("token", []).schedules;
  assert.deepEqual(Array.from(schedules, s => [s["予定開始"], s["予定終了"]]), [["09:00", "18:00"], ["10:00", "19:00"], ["22:00", "01:00"]]);
});

function rollbackFixture() {
  const f = fixture(); const c = f.context;
  const before = { record_id: "R1", "状態": "入店承認待ち", "正式開始": "", "正式終了": "", "更新日時": "before" };
  const record = { ...before, "状態": "稼働中", "正式開始": "09:00", "更新日時": "after" };
  const request = { request_id: "Q1", record_id: "R1", request_version: 1, "状態": "申請中" };
  const liveRequest = { ...request, request_version: 2, "状態": "承認済み" };
  c.findRequestById_ = () => liveRequest;
  c.rows_ = () => [record];
  c.updateById_ = (_s, key, _id, changes) => Object.assign(key === "record_id" ? record : liveRequest, changes);
  c.finalizeAttendanceAudit_ = (_r, _p, _t, _e, _v, result) => { if (result === "success") throw new Error("AUDIT_FAILED"); };
  const revision = c.attendanceRecordRevision_(record);
  return { ...f, record, liveRequest, run: () => c.handleAttendanceFinalizeFailure_(request, before, { decision: "承認" }, "token", "event", "reviewer", new Error("AUDIT_FAILED"), revision) };
}

test("承認通知失敗時も、その後の終了報告を復元処理で上書きしない", () => {
  const f = rollbackFixture();
  f.record["実終了"] = "18:00"; f.record["状態"] = "終了済み";
  assert.throws(f.run, error => error.code === "RECOVERY_REQUIRED");
  assert.equal(f.record["状態"], "終了済み");
  assert.equal(f.record["実終了"], "18:00");
  assert.equal(f.liveRequest["状態"], "承認済み");
});

test("別の承認による正式時刻の後続更新も保持する", () => {
  const f = rollbackFixture(); f.record["正式終了"] = "19:00";
  assert.throws(f.run, error => error.code === "RECOVERY_REQUIRED");
  assert.equal(f.record["正式終了"], "19:00");
});

test("後続更新がない場合だけ承認前へ復元する", () => {
  const f = rollbackFixture();
  assert.throws(f.run, /AUDIT_FAILED/);
  assert.equal(f.record["状態"], "入店承認待ち");
  assert.equal(f.record["正式開始"], "");
  assert.equal(f.liveRequest["状態"], "申請中");
  assert.equal(f.isHeld(), false);
});

test("承認の入口から外部通知失敗まで通しても後続の終了報告を保持する", () => {
  const { context: c, isHeld } = fixture();
  let record = { record_id: "R1", "状態": "入店承認待ち", "実開始": "09:00", "実終了": "" };
  let request = { request_id: "Q1", record_id: "R1", "状態": "申請中", "種別": "入店遅延報告", "申請開始": "09:00", request_version: 1, applicant_internal_user_id: "U1", approval_reviewer_internal_user_id: "U2" };
  c.ensureRequestContractHeadersForReview_ = () => {};
  c.rows_ = name => name === "勤怠記録" ? [{ ...record }] : [{ ...request }];
  c.updateById_ = (_name, key, _id, changes) => {
    assert.equal(isHeld(), true);
    if (key === "record_id") record = { ...record, ...changes };
    else request = { ...request, ...changes };
  };
  c.authorizeAttendanceReview_ = () => ({ authorization_event_id: "E1", reviewer_internal_user_id: "U2" });
  c.finalizeAttendanceAudit_ = (_r, _p, _t, _e, _u, result) => {
    assert.equal(isHeld(), false);
    if (result === "success") {
      record = { ...record, "状態": "終了済み", "実終了": "18:00" };
      throw new Error("NETWORK_FAILED");
    }
    assert.equal(result, "recovery_required");
  };
  assert.throws(() => c.reviewRequest_({ internal_user_id: "U2" }, { requestId: "Q1", decision: "承認", expectedRequestVersion: 1 }, "token"), error => error.code === "RECOVERY_REQUIRED");
  assert.equal(record["実終了"], "18:00");
  assert.equal(record["状態"], "終了済み");
  assert.equal(record["正式開始"], "09:00");
  assert.equal(request["状態"], "承認済み");
});

test("書込み確定で失敗してもロックを解放し次の操作で再取得する", () => {
  const { context: c, calls } = fixture();
  c.SpreadsheetApp.flush = () => { throw new Error("FLUSH_FAILED"); };
  const first = c.attendanceWriteLock_(); first.waitLock(1);
  assert.throws(() => first.releaseLock(), /FLUSH_FAILED/);
  const second = c.attendanceWriteLock_(); second.waitLock(1);
  assert.throws(() => second.releaseLock(), /FLUSH_FAILED/);
  assert.deepEqual(calls, ["acquire", "release", "acquire", "release"]);
});
