import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("共通ログイン応答へ既存のShiftBuilder権限を返す", () => {
  const source = readFileSync(
    new URL("../backend/account-apps-script/users.js", import.meta.url),
    "utf8"
  );
  const context = vm.createContext({
    buildPmoV2Url: () => "",
    console
  });

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

function createAttendanceContext(records) {
  const appendedReports = [];
  const reportHeaders = ["report_id", "record_id", "実績内容"];
  const sheets = {
    "勤怠記録": {
      getDataRange: () => ({
        getValues: () => [
          ["record_id", "email", "状態", "実終了", "正式終了"],
          ...records.map((record) => [record.record_id, record.email, record.status || "終了済み", record.actualEnd === undefined ? (record.status === "稼働中" ? "" : "2026-08-28T18:00:00+09:00") : record.actualEnd, record.formalEnd || ""])
        ]
      })
    },
    "実績報告": {
      appendRow: (row) => appendedReports.push(row),
      getDataRange: () => ({ getValues: () => [reportHeaders, ...appendedReports.map(row => [row[0], row[1], row[6]])] })
    }
  };
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: () => {
      throw new Error("テストでは実績報告シートが存在します");
    }
  };
  const context = vm.createContext({
    SpreadsheetApp: {
      getActive: () => spreadsheet
    },
    Utilities: {
      getUuid: () => "REPORT-1"
    },
    LockService: {
      getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    },
    console
  });
  const source = readFileSync(
    new URL("../backend/attendance-apps-script/Code.gs", import.meta.url),
    "utf8"
  );

  vm.runInContext(source, context);
  return { context, appendedReports };
}

test("実績報告はログイン本人の勤怠記録だけ受け付ける", () => {
  const { context, appendedReports } = createAttendanceContext([
    { record_id: "REC-1", email: " Member@Example.com " }
  ]);

  const result = context.submitReport_(
    { email: "member@example.com", name: "担当者" },
    { recordId: "REC-1", result: "完了" }
  );

  assert.equal(result.ok, true);
  assert.equal(appendedReports.length, 1);
});

test("実績報告は他人の勤怠記録を拒否する", () => {
  const { context, appendedReports } = createAttendanceContext([
    { record_id: "REC-OTHER", email: "other@example.com" }
  ]);

  assert.throws(
    () => context.submitReport_(
      { email: "member@example.com" },
      { recordId: "REC-OTHER", result: "完了" }
    ),
    (error) => error.code === "REPORT_RECORD_FORBIDDEN"
  );
  assert.equal(appendedReports.length, 0);
});

test("実績報告は存在しない勤怠記録を拒否する", () => {
  const { context, appendedReports } = createAttendanceContext([]);

  assert.throws(
    () => context.submitReport_(
      { email: "member@example.com" },
      { recordId: "REC-MISSING", result: "完了" }
    ),
    (error) => error.code === "REPORT_RECORD_FORBIDDEN"
  );
  assert.equal(appendedReports.length, 0);
});

test("稼働終了前の実績報告を拒否する", () => {
  const { context, appendedReports } = createAttendanceContext([
    { record_id: "REC-RUNNING", email: "member@example.com", status: "稼働中" }
  ]);
  assert.throws(
    () => context.submitReport_({ email: "member@example.com" }, { recordId: "REC-RUNNING", result: "途中" }),
    error => error.code === "REPORT_CLOCK_OUT_REQUIRED"
  );
  assert.equal(appendedReports.length, 0);
});

test("同じ勤怠記録の実績報告は二重登録しない", () => {
  const { context, appendedReports } = createAttendanceContext([
    { record_id: "REC-1", email: "member@example.com" }
  ]);
  context.submitReport_({ email: "member@example.com" }, { recordId: "REC-1", result: "完了" });
  const duplicate = context.submitReport_({ email: "member@example.com" }, { recordId: "REC-1", result: "再送" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(appendedReports.length, 1);
});

test("承認済みの正式終了があれば実績報告できる", () => {
  const { context, appendedReports } = createAttendanceContext([
    { record_id: "REC-CORRECTED", email: "member@example.com", status: "修正済み", actualEnd: "", formalEnd: "2026-08-28T18:00:00+09:00" }
  ]);
  assert.equal(context.submitReport_({ email: "member@example.com" }, { recordId: "REC-CORRECTED", result: "完了" }).ok, true);
  assert.equal(appendedReports.length, 1);
});

test("終了済み状態だけで終了時刻がなければ実績報告を拒否する", () => {
  const { context } = createAttendanceContext([
    { record_id: "REC-INCONSISTENT", email: "member@example.com", status: "終了済み", actualEnd: "", formalEnd: "" }
  ]);
  assert.throws(
    () => context.submitReport_({ email: "member@example.com" }, { recordId: "REC-INCONSISTENT", result: "完了" }),
    error => error.code === "REPORT_CLOCK_OUT_REQUIRED"
  );
});
