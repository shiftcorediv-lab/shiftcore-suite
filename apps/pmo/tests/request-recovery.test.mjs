import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const requestSource = readFileSync(new URL("../backend/pmo-apps-script/request.js", import.meta.url), "utf8");
const monthlySource = readFileSync(new URL("../backend/pmo-apps-script/monthly_sheet.js", import.meta.url), "utf8");
function fixture() {
  const values = [Array.from({ length: 12 }, (_, i) => `column${i}`), ["now", "2026-09", "U1", "名前", "2026-09-10", "", "OLD", true, true, "now", "希望休あり", "AN0001"]];
  const props = new Map(); let failAppend = false, failReflection = false;
  let reflected = null;
  const sheet = {
    getLastRow: () => values.length,
    getRange: (row, column, count = 1, width = 1) => ({
      getDisplayValues: () => Array.from({ length: count }, (_, offset) => values[row - 1 + offset].slice(column - 1, column - 1 + width).map(String)),
      setValues(rows) { if (failAppend) throw new Error("APPEND_FAILED"); values[row - 1] = [...rows[0]]; },
      setValue(value) { values[row - 1][column - 1] = value; }
    })
  };
  const c = vm.createContext({
    console,
    SETTINGS: { REQUEST_HEADER: values[0] },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value), deleteProperty: key => props.delete(key) }) },
    normalizeText: v => String(v ?? "").trim(),
    isValidYearMonth: () => true, isValidDateArray: () => true,
    getNowIsoStringJst: () => "now", getNowCompactTimestamp: () => "stamp",
    getOrCreateRequestSheet: () => sheet,
    ensureMonthlySheetExists_: () => {}
  });
  vm.runInContext(requestSource, c);
  c.reflectShiftRequestToMonthlySheet = saved => {
    if (failReflection) throw new Error("MONTHLY_FAILED");
    reflected = saved; values[saved.row - 1][8] = true;
  };
  const payload = { userId: "U1", displayName: "名前", employeeCode: "AN0001", targetYearMonth: "2026-09", offDates: ["2026-09-11"], memo: "memo", submitType: "希望休あり" };
  c.writeLatestRequestIndex_("U1", "2026-09", { success: true, exists: true, offDates: ["2026-09-10"] });
  return { c, values, props, payload, setFailAppend: value => { failAppend = value; }, setFailReflection: value => { failReflection = value; }, reflected: () => reflected };
}

test("新規原本保存に失敗しても旧最新申請を保持する", () => {
  const f = fixture(); f.setFailAppend(true);
  assert.throws(() => f.c.submitShiftRequest(f.payload), /APPEND_FAILED/);
  assert.equal(f.values.length, 2); assert.equal(f.values[1][7], true);
  const latest = f.c.getLatestShiftRequest("U1", "2026-09");
  assert.equal(latest.offDates[0], "2026-09-10");
});

test("月次反映に失敗しても原本の最新希望休を返し、未反映を明示する", () => {
  const f = fixture(); f.setFailReflection(true);
  assert.equal(f.c.submitShiftRequest(f.payload).code, "PMO_REFLECTION_PENDING");
  assert.equal(f.values[1][7], false); assert.equal(f.values[2][7], true);
  const latest = f.c.getLatestShiftRequest("U1", "2026-09");
  assert.equal(latest.offDates[0], "2026-09-11");
  assert.equal(latest.reflectionPending, true);
  assert.match(latest.message, /原本は保存済み/);
});

test("次の再読込で同じ原本行を月次へ再反映し、重複申請を作らない", () => {
  const f = fixture(); f.setFailReflection(true);
  assert.equal(f.c.submitShiftRequest(f.payload).code, "PMO_REFLECTION_PENDING");
  f.c.getLatestShiftRequest("U1", "2026-09");
  f.setFailReflection(false);
  const latest = f.c.getLatestShiftRequest("U1", "2026-09");
  assert.equal(latest.reflectionPending, undefined);
  assert.equal(f.reflected().row, 3);
  assert.equal(f.reflected().offDates[0], "2026-09-11");
  assert.equal(f.values.length, 3); assert.equal(f.values[2][8], true);
  f.c.findLatestRequestRow = () => assert.fail("successful index must avoid sheet scan");
  assert.equal(f.c.getLatestShiftRequest("U1", "2026-09").offDates[0], "2026-09-11");
});

test("旧版の永久インデックスを採用せず原本から再構築する", () => {
  const f = fixture(); f.props.clear();
  f.props.set("PMO_LATEST_REQUEST_2026-09_U1", JSON.stringify({ exists: true, offDates: ["2026-09-01"] }));
  assert.equal(f.c.getLatestShiftRequest("U1", "2026-09").offDates[0], "2026-09-10");
});

test("月次表は氏名・コードを保持し希望休を一行まとめて更新する", () => {
  const c = vm.createContext({ SETTINGS: { MONTHLY_STATUS_COLUMN: 1, MONTHLY_DAY_START_COLUMN: 5 }, getLastDayOfMonth: () => 30 });
  vm.runInContext(monthlySource, c);
  let values = ["希望休あり", "名前", "AN0001", "旧メモ", ...Array(30).fill("×")];
  let writes = 0;
  const sheet = { getRange: (_row, column, count, width) => {
    assert.deepEqual([column, count, width], [1, 1, 34]);
    return { getValues: () => [[...values]], setValues(rows) { writes++; values = [...rows[0]]; } };
  } };
  c.writeRequestToMonthlySheet(sheet, 2, { targetYearMonth: "2026-09", submitType: "希望休あり", memo: "新メモ", offDates: ["2026-09-11"] });
  assert.equal(writes, 1); assert.equal(values[1], "名前"); assert.equal(values[2], "AN0001");
  assert.equal(values[3], "新メモ"); assert.equal(values[14], "×");
  assert.equal(values.slice(4).filter(v => v === "×").length, 1);
  c.writeRequestToMonthlySheet(sheet, 2, { targetYearMonth: "2026-09", submitType: "希望休なし", offDates: [] });
  assert.equal(values.slice(4).every(v => v === ""), true);
});
