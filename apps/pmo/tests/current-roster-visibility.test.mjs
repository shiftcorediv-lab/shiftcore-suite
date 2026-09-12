import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function setup(fetchRoster) {
  const context = vm.createContext({
    normalizeText: (value) => String(value ?? "").trim(),
    SETTINGS: { MONTHLY_CODE_COLUMN: 3, REQUEST_HEADER: Array(12), EXCLUDED_EMPLOYEE_CODES_FOR_MONTHLY: ["DEV"] },
    getLastDayOfMonth: () => 31,
    getOrCreateRequestSheet: () => ({ getLastRow: () => 1 }),
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

test("社員番号変更後も本人IDで最新原本を表示し、旧番号と二重表示しない", () => {
  const context = setup(() => [
    { userId: "U30", employeeCode: "AN0014", displayName: "対象者" },
    { userId: "U31", employeeCode: "AN0015", displayName: "未提出者" },
  ]);
  const requests = [
    ["", "2026-10", "U30", "旧名", "2026-10-02", "", "", "FALSE", "", "", "希望休あり", "AN10000"],
    ["", "2026-10", "U30", "旧名", "2026-10-01,2026-10-05,2026-10-06,2026-10-24", "メモ", "", "TRUE", "", "", "希望休あり", "AN10000"],
    ["", "2026-09", "U30", "旧名", "", "", "", "TRUE", "", "", "希望休なし", "AN10000"],
    ["", "2026-10", "STOP", "停止者", "", "", "", "TRUE", "", "", "希望休なし", "AN10001"],
  ];
  context.getOrCreateRequestSheet = () => ({ getLastRow: () => requests.length + 1, getRange: () => ({ getDisplayValues: () => requests }) });
  const rows = [["希望休あり", "旧名", "AN10000"], ["未提出", "対象者", "AN0014"]];
  const before = JSON.stringify({ rows, requests });
  const result = context.filterCurrentRosterRowsFromMonthlyTable_(rows, "2026-10");
  assert.deepEqual(Array.from(result, r => r[2]), ["AN0014", "AN0015"]);
  assert.deepEqual(Array.from(result[0]).slice(4).flatMap((v, i) => v === "×" ? [i + 1] : []), [1, 5, 6, 24]);
  assert.equal(result[0][1], "対象者");
  assert.equal(result[1][0], "未提出");
  assert.equal(JSON.stringify({ rows, requests }), before);
  requests[1][10] = "希望休なし";
  assert.equal(context.filterCurrentRosterRowsFromMonthlyTable_(rows, "2026-10")[0].slice(4).includes("×"), false);
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
