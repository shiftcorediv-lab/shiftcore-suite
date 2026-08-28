import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function createContext(initialRows = []) {
  const headers = ["field_report_id", "勤務日", "開発予定ID", "報告種別", "報告者メール", "報告者氏名", "報告日時"];
  const values = initialRows.map(row => headers.map(header => row[header] ?? ""));
  const sheet = {
    getDataRange: () => ({ getValues: () => [headers, ...values] }),
    appendRow: row => values.push(row),
    setFrozenRows: () => {}
  };
  const context = vm.createContext({
    SpreadsheetApp: {
      getActive: () => ({ getSheetByName: name => name === "現場報告" ? sheet : null, insertSheet: () => sheet })
    },
    LockService: { getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => `FIELD-${values.length + 1}`,
      formatDate: (_date, _tz, format) => format === "yyyy-MM-dd" ? "2026-08-28" : format === "HH:mm" ? "12:00" : "2026/08/28 12:00"
    },
    console
  });
  vm.runInContext(readFileSync(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8"), context);
  context.findSchedule_ = () => ({ schedule_id: "SCHEDULE-1", "開発予定ID": "PLAN-1" });
  context.notifyManagers_ = () => {};
  return { context, values };
}

test("本人は出発から入店の順で現場報告できる", () => {
  const { context, values } = createContext();
  const user = { email: "member@example.com", name: "担当者" };

  assert.equal(context.submitFieldReport_(user, { reportType: "出発", scheduleId: "SCHEDULE-1" }, "token").ok, true);
  assert.equal(context.submitFieldReport_(user, { reportType: "入店", scheduleId: "SCHEDULE-1" }, "token").ok, true);
  assert.equal(values.length, 2);
  assert.deepEqual(values.map(row => row[3]), ["出発", "入店"]);
});

test("出発前の入店報告を拒否する", () => {
  const { context, values } = createContext();
  assert.throws(
    () => context.submitFieldReport_({ email: "member@example.com" }, { reportType: "入店" }, "token"),
    error => error.code === "DEPARTURE_REPORT_REQUIRED"
  );
  assert.equal(values.length, 0);
});

test("同じ日の同じ報告は二重登録しない", () => {
  const { context, values } = createContext();
  const user = { email: "member@example.com" };
  context.submitFieldReport_(user, { reportType: "出発" }, "token");
  const duplicate = context.submitFieldReport_(user, { reportType: "出発" }, "token");
  assert.equal(duplicate.duplicate, true);
  assert.equal(values.length, 1);
});

test("他人の出発報告を本人の入店条件に使わない", () => {
  const { context } = createContext([{ "field_report_id": "FIELD-1", "勤務日": "2026-08-28", "報告種別": "出発", "報告者メール": "other@example.com" }]);
  assert.throws(
    () => context.submitFieldReport_({ email: "member@example.com" }, { reportType: "入店" }, "token"),
    error => error.code === "DEPARTURE_REPORT_REQUIRED"
  );
});

test("別予定の出発報告を入店条件や重複判定に使わない", () => {
  const { context, values } = createContext([{ "field_report_id": "FIELD-1", "勤務日": "2026-08-28", "開発予定ID": "PLAN-OTHER", "報告種別": "出発", "報告者メール": "member@example.com" }]);
  const user = { email: "member@example.com" };
  assert.throws(
    () => context.submitFieldReport_(user, { reportType: "入店" }, "token"),
    error => error.code === "DEPARTURE_REPORT_REQUIRED"
  );
  assert.equal(context.submitFieldReport_(user, { reportType: "出発" }, "token").duplicate, undefined);
  assert.equal(values.length, 2);
});

test("未知の報告種別を拒否する", () => {
  const { context } = createContext();
  assert.throws(
    () => context.submitFieldReport_({ email: "member@example.com" }, { reportType: "代理報告" }, "token"),
    error => error.code === "FIELD_REPORT_TYPE_INVALID"
  );
});

test("ダッシュボードは出発・入店の本人操作をAPIへ送る", () => {
  const source = readFileSync(new URL("../js/dashboard/main.js", import.meta.url), "utf8");
  assert.match(source, /attendanceRequest\("submitFieldReport", \{ reportType, scheduleId:/);
  assert.match(source, /submitFieldReport\("出発"\)/);
  assert.match(source, /submitFieldReport\("入店"\)/);
});
