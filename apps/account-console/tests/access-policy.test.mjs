import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseSignupAdminAccess,
  getEffectiveModuleCodes,
  normalizeModuleList
} from "../js/common/access-policy.mjs";

test("登録申請管理の参照入口は管理roleまたはaccount_consoleで許可する", () => {
  assert.equal(canUseSignupAdminAccess({ role: "admin" }), true);
  assert.equal(canUseSignupAdminAccess({ role: "developer" }), true);
  assert.equal(canUseSignupAdminAccess({ role: "member", allowed_modules: ["account_console"] }), true);
  assert.equal(canUseSignupAdminAccess({ role: "member", allowed_modules: ["shift"] }), false);
});

test("モジュール値は配列とCSVの表記揺れを正規化する", () => {
  assert.deepEqual(normalizeModuleList(" Account_Console, SHIFT "), ["account_console", "shift"]);
  assert.deepEqual(normalizeModuleList(["OrderCase", " shiftbuilder "]), ["ordercase", "shiftbuilder"]);
});

test("ShiftBuilderの既知権限と旧値のどちらでも入口を維持する", () => {
  assert.deepEqual(getEffectiveModuleCodes(["shift"], { shiftbuilder_permission: "view" }), ["shift"]);
  assert.deepEqual(getEffectiveModuleCodes(["shift"], { shiftbuilder_permission: "旧管理値" }), ["shift"]);
  assert.deepEqual(getEffectiveModuleCodes(["shift"], {}), ["shift"]);
});

test("OrderCaseは権限値を必須にしAccount Consoleは割当済みなら閲覧入口を出す", () => {
  assert.deepEqual(getEffectiveModuleCodes(["ordercase"], { ordercase_permission: "view" }), ["ordercase"]);
  assert.deepEqual(getEffectiveModuleCodes(["ordercase"], { ordercase_permission: "" }), []);
  assert.deepEqual(getEffectiveModuleCodes(["account_console"], { role: "admin" }), ["account_console"]);
  assert.deepEqual(getEffectiveModuleCodes(["account_console"], { role: "member" }), ["account_console"]);
});

test("developerは個別モジュール設定に依存せず全機能の入口を持つ", () => {
  assert.deepEqual(
    getEffectiveModuleCodes([], { role: "developer" }),
    ["account_console", "pmo", "ordercase", "shift"]
  );
});
