import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function createAttendanceContext(records) {
  const appendedReports = [];
  const sheets = {
    "勤怠記録": {
      getDataRange: () => ({
        getValues: () => [
          ["record_id", "email", "状態"],
          ...records.map((record) => [record.record_id, record.email, record.status || "終了済み"])
        ]
      })
    },
    "実績報告": {
      appendRow: (row) => appendedReports.push(row)
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
