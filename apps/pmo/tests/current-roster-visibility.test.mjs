import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function setup(fetchRoster) {
  const context = vm.createContext({
    normalizeText: (value) => String(value ?? "").trim(),
    SETTINGS: { MONTHLY_CODE_COLUMN: 3, EXCLUDED_EMPLOYEE_CODES_FOR_MONTHLY: ["DEV"] },
    fetchRosterFromShiftCore_: fetchRoster,
  });
  vm.runInContext(readFileSync(new URL("../backend/pmo-apps-script/monthly_sheet.js", import.meta.url), "utf8"), context);
  return context;
}

test("月次原本を変更せず現在の対象コードで絞る（同姓・表記ゆれ・除外コード）", () => {
  const context = setup(() => [{ employeeCode: " an001 " }, { employeeCode: "DEV" }]);
  const rows = [["提出済", "青木", "AN001", "休"], ["提出済", "青木", "AN002", "休"], ["未提出", "開発者", "DEV"]];
  const before = JSON.stringify(rows);
  const result = context.filterCurrentRosterRowsFromMonthlyTable_(rows);
  assert.deepEqual(Array.from(result, (row) => row[2]), ["AN001"]);
  assert.equal(JSON.stringify(rows), before);
});

test("現在の対象が0人なら過去の行を表示しない", () => {
  assert.equal(setup(() => []).filterCurrentRosterRowsFromMonthlyTable_([["未提出", "旧対象", "AN001"]]).length, 0);
});

test("名簿取得失敗を成功や古い一覧に置き換えない", () => {
  assert.throws(() => setup(() => { throw new Error("名簿取得失敗"); }).filterCurrentRosterRowsFromMonthlyTable_([]), /名簿取得失敗/);
});

test("初回と更新の両方が最新名簿で絞った一覧を使う", () => {
  let calls = 0;
  const context = setup(() => { calls++; return [{ employeeCode: "AN001" }]; });
  Object.assign(context, {
    isValidYearMonth: () => true,
    getMonthlyRequestSheet: () => ({
      getLastRow: () => 3, getLastColumn: () => 3, getName: () => "希望休一覧_202609",
      getRange: (row) => ({ getDisplayValues: () => row === 1 ? [["状態", "氏名", "コード"]] : [["未提出", "有効", "AN001"], ["提出済", "旧対象", "AN002"]] }),
    }),
  });
  for (const result of [context.getPmoMonthlyTable("2026-09", "admin"), context.buildPmoMonthlyTableData_("2026-09", "admin")]) {
    assert.equal(result.success, true);
    assert.deepEqual(Array.from(result.rows, (row) => row[2]), ["AN001"]);
  }
  assert.equal(calls, 2);
});
