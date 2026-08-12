import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseSignupAdminAccess,
  getEffectiveModuleCodes,
  normalizeModuleList
} from "../js/common/access-policy.mjs";

test("登録申請管理は既存仕様どおり管理roleまたはaccount_consoleで許可する", () => {
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

test("OrderCaseとAccount Consoleは既存の詳細条件を維持する", () => {
  assert.deepEqual(getEffectiveModuleCodes(["ordercase"], { ordercase_permission: "view" }), ["ordercase"]);
  assert.deepEqual(getEffectiveModuleCodes(["ordercase"], { ordercase_permission: "" }), []);
  assert.deepEqual(getEffectiveModuleCodes(["account_console"], { role: "admin" }), ["account_console"]);
  assert.deepEqual(getEffectiveModuleCodes(["account_console"], { role: "member" }), []);
});

test("developerは個別モジュール設定に依存せず全機能の入口を持つ", () => {
  assert.deepEqual(
    getEffectiveModuleCodes([], { role: "developer" }),
    ["account_console", "pmo", "ordercase", "shift"]
  );
});
