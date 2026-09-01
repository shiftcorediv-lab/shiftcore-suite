import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const casesSource = readFileSync(
  new URL("../backend/ordercase-apps-script/Service_Cases.js", import.meta.url),
  "utf8"
);
const repositorySource = readFileSync(
  new URL("../backend/ordercase-apps-script/Repository_Sheets.js", import.meta.url),
  "utf8"
);
const fastDetailSource = readFileSync(
  new URL("../backend/ordercase-apps-script/Service_CaseDetailPageFast.js", import.meta.url),
  "utf8"
);

function createContext(source) {
  const context = vm.createContext({
    Array,
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    String,
    console,
    isFinite,
    isNaN
  });
  vm.runInContext(source, context);
  return context;
}

test("同条件件数と金額は不正な小数・負数・区分を拒否する", () => {
  const context = createContext(casesSource);

  assert.equal(context.normalizeSameConditionCount_(1), 1);
  assert.equal(context.normalizeSameConditionCount_(20), 20);
  assert.throws(() => context.normalizeSameConditionCount_(1.5), /整数/);
  assert.throws(() => context.validateAmountFields_({ amount: -1, amount_type: "per_case" }, false), /0以上/);
  assert.throws(() => context.validateAmountFields_({ amount: 100, amount_type: "invalid" }, false), /金額区分/);
  assert.throws(() => context.validateAmountFields_({ amount: 100, amount_type: "" }, false), /金額区分を選択/);
  assert.throws(() => context.validateAmountFields_({ amount: 100, amount_type: "per_day" }, false), /金額区分/);
  assert.doesNotThrow(() => context.validateAmountFields_({ amount: 100, amount_type: "per_day" }, true));
});

test("日別・異時間者単価は0以上の数値だけを受け付ける", () => {
  const context = createContext(casesSource);

  assert.throws(
    () => context.validateCaseDateConditionOverrides_({
      amount_type: "per_person_day",
      case_dates: [{
        work_date: "2026-09-10",
        has_condition_override: true,
        work_start_time: "22:00",
        work_end_time: "01:00",
        has_alternate_time_workers: true,
        alternate_worker_count: 1,
        alternate_work_start_time: "23:00",
        alternate_work_end_time: "02:00",
        alternate_amount_enabled: true,
        alternate_amount: -1
      }]
    }, 2),
    /0以上/
  );

  assert.throws(
    () => context.buildCaseDateConditionUpdates_({
      amount_type: "per_person_day",
      case_dates: [{
        case_date_id: "DATE-1",
        work_date: "2026-09-10",
        work_start_time: "22:00",
        work_end_time: "01:00",
        unit_amount_override: "invalid"
      }]
    }, [{ case_date_id: "DATE-1" }]),
    /0以上/
  );
});

test("住所列は既存列を保持して不足分だけ末尾へ追加する", () => {
  const context = createContext(casesSource);
  const headers = ["case_id", "work_address"];
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: (_row, column) => ({
      getValues: () => [headers.slice()],
      setValue(value) {
        headers[column - 1] = value;
      }
    })
  };
  context.SHEET_CASES = "cases";
  context.getSheetForUpdate_ = () => sheet;

  context.ensureCaseLocationColumns_();
  assert.deepEqual(headers, ["case_id", "work_address", "work_nearest_station"]);
});

test("スプレッドシート由来の時刻はAPI向けのHH:mmへ正規化する", () => {
  const context = createContext(repositorySource);
  context.formatDate_ = () => "18:00";

  assert.equal(
    context.normalizeSheetValue_("work_start_time", "1899-12-30 10:00:00"),
    "10:00"
  );
  assert.equal(
    context.normalizeSheetValue_("work_end_time", new Date(1899, 11, 30, 18, 0)),
    "18:00"
  );
  assert.equal(context.normalizeSheetValue_("meeting_time", 0.5), "12:00");
  assert.equal(context.normalizeSheetValue_("work_start_time", "25:00"), "25:00");
});

test("案件詳細の高速読取も共通APIと同じHH:mmを返す", () => {
  const context = createContext(repositorySource + "\n" + fastDetailSource);
  context.formatDate_ = () => "18:00";

  assert.equal(
    context.formatFastCellValue_("work_start_time", "1899-12-30 10:00:00"),
    "10:00"
  );
  assert.equal(
    context.formatFastCellValue_("work_end_time", new Date(1899, 11, 30, 18, 0)),
    "18:00"
  );
  assert.equal(
    context.formatFastCellValue_("alternate_work_start_time", "1899-12-30 11:30:00"),
    "11:30"
  );
});

test("時刻同期はdraftだけを更新し、確定済みと別案件を保護する", () => {
  const context = createContext(repositorySource);
  const rows = [
    ["assignment_id", "case_id", "case_date_id", "assignment_status", "start_time", "end_time", "updated_at", "updated_by", "archived"],
    ["A-1", "CASE-1", "DATE-1", "draft", "09:00", "18:00", "", "", false],
    ["A-2", "CASE-1", "DATE-2", "published", "09:00", "18:00", "", "", false],
    ["A-3", "CASE-2", "DATE-1", "draft", "09:00", "18:00", "", "", false]
  ];
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map(row => row.slice()) }),
    getRange(row, column, _rowCount, columnCount) {
      return {
        getValues: () => [rows[row - 1].slice(column - 1, column - 1 + columnCount)],
        setValue(value) {
          rows[row - 1][column - 1] = value;
          return this;
        }
      };
    }
  };
  context.getShiftAssignmentsSheetForOrderCase_ = () => sheet;
  context.SpreadsheetApp = { flush() {} };
  context.formatDate_ = () => "2026-09-02T04:00:00+09:00";

  const result = context.syncDraftShiftAssignmentTimesByCaseId_(
    "CASE-1",
    { start_time: "10:00", end_time: "19:00" },
    {},
    "tester@example.com",
    new Date("2026-09-01T19:00:00Z")
  );

  assert.equal(result.updated_count, 1);
  assert.equal(result.protected_count, 1);
  assert.equal(rows[1][4], "10:00");
  assert.equal(rows[1][5], "19:00");
  assert.equal(rows[2][4], "09:00");
  assert.equal(rows[3][4], "09:00");
});

test("案件更新の時刻同期は日別上書きと共通時刻を合成する", () => {
  const context = createContext(casesSource);
  let received;
  context.syncDraftShiftAssignmentTimesByCaseId_ = (...args) => {
    received = args;
    return { updated_count: 2, protected_count: 1 };
  };

  const result = context.syncCaseAssignmentTimesAfterCaseUpdate_(
    "CASE-1",
    { work_start_time: "10:00", work_end_time: "19:00" },
    [
      { case_date_id: "DATE-1", work_start_time: "", work_end_time: "" },
      { case_date_id: "DATE-2", work_start_time: "11:00", work_end_time: "20:00" }
    ],
    [{ case_date_id: "DATE-2", work_start_time: "22:00", work_end_time: "01:00" }],
    "tester@example.com",
    new Date("2026-09-01T19:00:00Z")
  );

  assert.equal(result.succeeded, true);
  assert.equal(result.updated_count, 2);
  assert.equal(received[0], "CASE-1");
  assert.deepEqual(JSON.parse(JSON.stringify(received[1])), { start_time: "10:00", end_time: "19:00" });
  assert.deepEqual(JSON.parse(JSON.stringify(received[2])), {
    "DATE-1": { start_time: "10:00", end_time: "19:00" },
    "DATE-2": { start_time: "22:00", end_time: "01:00" }
  });
});
