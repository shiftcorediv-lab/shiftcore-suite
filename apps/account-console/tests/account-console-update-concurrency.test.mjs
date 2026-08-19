import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
  "utf8"
);

const updateFunction = source.slice(
  source.indexOf("function accountConsoleUpdateUser(body)"),
  source.indexOf("// ===== ユーザー更新ここまで =====")
);

test("通常アカウント更新は組織列を含む行全体を書き戻さない", () => {
  assert.doesNotMatch(updateFunction, /getRange\(targetRowIndex,\s*1,\s*1,[\s\S]*?setValues/);
  assert.match(updateFunction, /editableFields\.concat\(\["updated_at", "updated_by"\]\)/);
});

test("通常アカウント更新は組織更新と同じScriptLockで直列化する", () => {
  assert.match(updateFunction, /LockService\.getScriptLock\(\)/);
  assert.match(updateFunction, /tryLock\(10000\)/);
  assert.match(updateFunction, /finally\s*\{[\s\S]*?lock\.releaseLock\(\)/);
});
