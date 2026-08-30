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
    getRange: (row, column, rowCount = 1, columnCount = 1) => ({
      getValues: () => Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => values[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? "")),
      setValue: value => { ensureCell(row - 1, column - 1); values[row - 1][column - 1] = value; },
      setValues: rows => rows.forEach((sourceRow, rowOffset) => sourceRow.forEach((value, columnOffset) => { ensureCell(row - 1 + rowOffset, column - 1 + columnOffset); values[row - 1 + rowOffset][column - 1 + columnOffset] = value; }))
    }),
    setFrozenRows: () => {}
  };
}

function createAttendanceContext(records) {
  let uuid = 0;
  const sheets = {
    "勤怠記録": createSheet([
      ["record_id", "email", "氏名", "勤務日", "予定場所", "開発予定ID", "状態", "実終了", "正式終了", "schedule_id"],
      ...records.map(record => [record.record_id, record.email, record.name || "担当者", record.workDate || "2026-08-28", record.storeName || "店舗A", record.planId || "PLAN-1", record.status || "終了済み", record.actualEnd === undefined ? (record.status === "稼働中" ? "" : "2026-08-28T18:00:00+09:00") : record.actualEnd, record.formalEnd || "", record.scheduleId || ""])
    ]),
    "実績報告": createSheet([["report_id", "record_id", "開発予定ID", "開発予定名", "報告者メール", "報告者氏名", "実績内容", "課題・申し送り", "報告日時"]])
  };
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => (sheets[name] = createSheet())
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActive: () => spreadsheet },
    Utilities: {
      getUuid: () => `UUID-${++uuid}`,
      formatDate: (date, _tz, format) => format === "yyyy-MM-dd" ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "2026/08/28 18:00"
    },
    LockService: { getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    console
  });
  vm.runInContext(backendSource, context);
  return { context, sheets };
}

function validAnswers() {
  return [
    { itemId: "responseCount", value: 0 },
    { itemId: "successfulActions", value: "声かけを工夫した" },
    { itemId: "measuresAndResults", value: "導線を変えて改善した" }
  ];
}

test("実績報告はログイン本人の終了済み勤怠だけ受け付ける", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-1", email: " Member@Example.com " }]);
  const result = context.submitReport_({ email: "member@example.com", name: "担当者" }, { recordId: "REC-1", answers: validAnswers() });
  assert.equal(result.ok, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("実績報告は他人・存在しない勤怠記録を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-OTHER", email: "other@example.com" }]);
  for (const recordId of ["REC-OTHER", "REC-MISSING"]) {
    assert.throws(() => context.submitReport_({ email: "member@example.com" }, { recordId, answers: validAnswers() }), error => error.code === "REPORT_RECORD_FORBIDDEN");
  }
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("稼働終了前の実績報告を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-RUNNING", email: "member@example.com", status: "稼働中" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, { recordId: "REC-RUNNING", answers: validAnswers() }), error => error.code === "REPORT_CLOCK_OUT_REQUIRED");
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("同じ勤怠記録の実績報告は再送しても二重登録しない", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-1", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, { recordId: "REC-1", answers: validAnswers() });
  const duplicate = context.submitReport_({ email: "member@example.com" }, { recordId: "REC-1", answers: validAnswers() });
  assert.equal(duplicate.duplicate, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("通信断相当の保存中報告は不足回答だけを補完して完了する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-RETRY", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, { recordId: "REC-RETRY", answers: validAnswers() });
  const reportHeaders = sheets["実績報告"].values[0];
  sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")] = "保存中";
  sheets["実績回答"].values.pop();
  const retry = context.submitReport_({ email: "member@example.com" }, { recordId: "REC-RETRY", answers: validAnswers() });
  assert.equal(retry.ok, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")], "提出済み");
});

test("承認済みの正式終了があれば実績報告できる", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-CORRECTED", email: "member@example.com", status: "修正済み", actualEnd: "", formalEnd: "2026-08-28T18:00:00+09:00" }]);
  assert.equal(context.submitReport_({ email: "member@example.com" }, { recordId: "REC-CORRECTED", answers: validAnswers() }).ok, true);
});

test("終了済み状態だけで終了時刻がなければ実績報告を拒否する", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-INCONSISTENT", email: "member@example.com", status: "終了済み", actualEnd: "", formalEnd: "" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, { recordId: "REC-INCONSISTENT", answers: validAnswers() }), error => error.code === "REPORT_CLOCK_OUT_REQUIRED");
});

test("数値0と未入力を区別し、負数・小数・不正値を拒否する", () => {
  const { context } = createAttendanceContext([]);
  const definitions = [
    { item_id: "required", "項目名": "必須件数", "種別": "number", "必須": true },
    { item_id: "optional", "項目名": "任意件数", "種別": "number", "必須": false }
  ];
  const normalized = context.normalizeWorkReportAnswers_(definitions, [{ itemId: "required", value: 0 }]);
  assert.equal(normalized[0].inputState, "answered");
  assert.equal(normalized[1].value, 0);
  assert.equal(normalized[1].inputState, "defaulted");
  for (const value of [-1, 1.5, "abc"]) {
    assert.throws(() => context.normalizeWorkReportAnswers_(definitions, [{ itemId: "required", value }]), error => error.code === "REPORT_NUMBER_INVALID");
  }
});
