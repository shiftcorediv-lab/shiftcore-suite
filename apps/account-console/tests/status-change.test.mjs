import test from "node:test";
import assert from "node:assert/strict";
import { statusOnlyChange } from "../js/account-console/status-change.mjs";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const baseline = { internal_user_id: "TEST1", status: "active", family_name: "旧登録", given_name: "", allowed_modules: "shift", shiftbuilder_permission: "" };
test("旧データが不完全でも状態だけの停止を識別する", () => {
  assert.equal(statusOnlyChange({ ...baseline, status: "inactive" }, baseline), true);
});
test("他項目の変更は状態のみとして捨てない", () => {
  assert.equal(statusOnlyChange({ ...baseline, status: "inactive", family_name: "変更" }, baseline), false);
});
test("別アカウントと新規登録を状態更新にしない", () => {
  assert.equal(statusOnlyChange({ ...baseline, internal_user_id: "TEST2", status: "inactive" }, baseline), false);
  assert.equal(statusOnlyChange(baseline, null), false);
});

const backend = vm.createContext({ normalizeText: value => String(value ?? "").trim(), VALID_ACCOUNT_STATUSES: ["active", "inactive"] });
vm.runInContext(readFileSync(new URL("../backend/account-apps-script/account_console_users.js", import.meta.url), "utf8"), backend);
test("旧姓だけの全項目送信は失敗するが状態のみの既存API更新は受理される", () => {
  assert.throws(() => backend.validateAccountConsoleUserPayload_({ ...baseline, status: "inactive" }, false), /両方入力/);
  assert.doesNotThrow(() => backend.validateAccountConsoleUserPayload_({ internal_user_id: "TEST1", status: "inactive" }, false));
});
test("開発者は別スタッフの停止が可能だが自分自身の停止は禁止を維持", () => {
  const operator = { internal_user_id: "DEV", role: "developer" };
  assert.doesNotThrow(() => backend.assertAccountConsoleSelfSensitiveFieldsUnchanged_(operator, baseline, { ...baseline, status: "inactive" }, "TEST1"));
  assert.throws(() => backend.assertAccountConsoleSelfSensitiveFieldsUnchanged_(operator, baseline, { ...baseline, status: "inactive" }, "DEV"), /SELF_ACCOUNT_PERMISSION_CHANGE_FORBIDDEN/);
});
