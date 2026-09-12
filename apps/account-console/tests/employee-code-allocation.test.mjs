import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function allocate(codes) {
  const context = vm.createContext({
    getUsersSheet: () => ({
      getLastRow: () => codes.length + 1,
      getRange: () => ({ getDisplayValues: () => codes.map(code => [code]) }),
    }),
    getHeaderMap_: () => ({ employee_code: 1 }),
  });
  vm.runInContext(readFileSync(new URL("../backend/account-apps-script/signup_user_write.js", import.meta.url), "utf8"), context);
  return context.createNextEmployeeCode_();
}

test("空の名簿はAN0001から採番する", () => {
  assert.equal(allocate([]), "AN0001");
});

test("特殊番号・旧不正採番に引きずられず通常の連番を発行する", () => {
  const codes = ["AN0000", "AN0013", "AN0014", "AN9999", "AN10000"];
  const before = [...codes];
  assert.equal(allocate(codes), "AN0015");
  assert.deepEqual(codes, before);
});

test("欠番を埋めず全使用済み番号の次を採番する", () => {
  assert.equal(allocate(["AN0001", "AN0003", "AN0020"]), "AN0021");
});

test("空白・小文字でも使用済み番号として扱う", () => {
  assert.equal(allocate([" an0015 ", "AN0014", "", "OTHER"]), "AN0016");
});

test("続けて登録しても同じ番号を返さない", () => {
  const codes = ["AN0014", "AN9999", "AN10000"];
  for (let i = 15; i <= 24; i++) {
    const code = allocate(codes);
    assert.equal(code, "AN" + String(i).padStart(4, "0"));
    assert.equal(codes.includes(code), false);
    codes.push(code);
  }
});

test("4桁の上限で特殊番号や5桁を発行しない", () => {
  assert.equal(allocate(["AN9997"]), "AN9998");
  assert.throws(() => allocate(["AN9998", "AN9999", "AN10000"]), /自動採番範囲/);
});
