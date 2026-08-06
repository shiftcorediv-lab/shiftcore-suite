import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runAuthorizationShadowCheck } from "../js/shiftbuilder/authorization-shadow-policy.mjs";

test("IDトークンがなければShadow APIを呼ばない", async () => {
  let called = false;
  const result = await runAuthorizationShadowCheck("", async () => {
    called = true;
  });

  assert.equal(called, false);
  assert.deepEqual(result, { attempted: false, healthy: false });
});

test("Shadow APIが正常なら健全として返す", async () => {
  const result = await runAuthorizationShadowCheck("TOKEN", async () => ({
    ok: true,
    authorization: { shadow: { healthy: true } }
  }));

  assert.deepEqual(result, { attempted: true, healthy: true });
});

test("Shadow API失敗を隔離して既存初期化へ例外を漏らさない", async () => {
  const warnings = [];
  const result = await runAuthorizationShadowCheck(
    "TOKEN",
    async () => { throw new Error("network error"); },
    { warn: (...args) => warnings.push(args) }
  );

  assert.deepEqual(result, { attempted: true, healthy: false });
  assert.equal(warnings.length, 1);
});

test("ログインセッション全体をブラウザコンソールへ出力しない", () => {
  const mainSource = readFileSync(
    new URL("../js/shiftbuilder/main.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(mainSource, /console\.log\([^\n]*auth session/);
});
