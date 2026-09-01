import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { resolveAccountFullName } from "../js/account-console/name-policy.mjs";

const backendSource = readFileSync(
  new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
  "utf8"
);
const mainSource = readFileSync(
  new URL("../js/account-console/main.js", import.meta.url),
  "utf8"
);

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

test("一覧表示は既存の氏名より姓と名を優先する", () => {
  assert.equal(resolveAccountFullName({
    family_name: "細見",
    given_name: "大樹",
    name: "細見"
  }), "細見大樹");
});

test("未分割の既存アカウントは従来の氏名を表示する", () => {
  assert.equal(resolveAccountFullName({ name: "既存氏名" }), "既存氏名");
  assert.equal(resolveAccountFullName({ family_name: "細見", name: "既存氏名" }), "既存氏名");
});

test("保存時は既存氏名があっても姓と名から氏名を同期する", () => {
  assert.match(mainSource, /if \(hasFamilyName && hasGivenName\) \{\s*user\.name = resolveAccountFullName\(user\);/);
  assert.doesNotMatch(mainSource, /if \(!user\.name && hasFamilyName && hasGivenName\)/);
});

test("バックエンドも姓と名を氏名の正本として扱う", () => {
  const start = backendSource.indexOf("function getAccountConsoleFullName_(payload)");
  const end = backendSource.indexOf("function ensureAccountConsoleNameColumns_", start);
  const context = vm.createContext({ normalizeText });
  vm.runInContext(backendSource.slice(start, end), context);

  assert.equal(context.getAccountConsoleFullName_({
    family_name: "細見",
    given_name: "大樹",
    name: "細見"
  }), "細見大樹");
  assert.equal(context.getAccountConsoleFullName_({ name: "既存氏名" }), "既存氏名");
  assert.equal(context.getAccountConsoleFullName_({
    family_name: "細見",
    name: "既存氏名"
  }), "既存氏名");
});

test("アカウント更新でも氏名の同期を強制する", () => {
  const start = backendSource.indexOf("function accountConsoleUpdateUser(body)");
  const end = backendSource.indexOf("// ===== ユーザー更新ここまで =====", start);
  const updateSource = backendSource.slice(start, end);

  assert.match(updateSource, /afterUser\.name = getAccountConsoleFullName_\(afterUser\);/);
});
