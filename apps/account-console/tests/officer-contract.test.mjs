import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
function backend() {
  const context = vm.createContext({});
  for (const file of ["config.js", "utils.js", "users.js", "account_console_users.js"]) {
    vm.runInContext(read(`../backend/account-apps-script/${file}`), context);
  }
  context.buildPmoV2Url = () => "";
  return context;
}

test("契約区分の役員を保存用検証で許可し、不正な区分は拒否する", () => {
  const context = backend();
  assert.doesNotThrow(() => context.validateAccountConsoleUserPayload_({ contract_type: "officer" }, false));
  assert.throws(() => context.validateAccountConsoleUserPayload_({ contract_type: "invalid-contract" }, false), /contract_type/);
});

test("役員の契約区分は再取得しても維持され、操作権限を変えない", () => {
  const context = backend();
  const user = { internal_user_id: "TEST-1", name: "テスト", email: "test@example.com", role: "internal", contract_type: "officer", person_type: "internal", allowed_modules: "pmo", status: "active" };
  const member = context.buildAccountConsoleUser_(user);
  const login = context.buildLoginUserResponse(user);
  assert.equal(member.contract_type, "officer");
  assert.equal(login.contract_type, "officer");
  assert.equal(login.contractType, "officer");
  assert.equal(login.role, user.role);
  assert.deepEqual(Array.from(login.allowed_modules), ["pmo"]);
});

test("役員を編集選択肢と共通の契約区分表示に追加する", () => {
  const html = read("../account-console.html");
  const ui = read("../js/account-console/ui.js");
  const options = html.match(/<select id="contractTypeInput">([\s\S]*?)<\/select>/)[1];
  assert.match(options, /<option value="officer">役員<\/option>/);
  assert.match(ui, /const CONTRACT_TYPE_LABELS = \{\s*officer: "役員"/);
  assert.match(ui, /contractTypeInput.value = text\(user.contract_type\)/);
  assert.match(ui, /contract_type: text\(contractTypeInput.value\)/);
});
