import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("../js/shiftbuilder/auth.js", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");

test("ログイン済みShift画面のアカウントメニューへログアウトを追加する", () => {
  assert.match(mainSource, /\.shiftcore-account-menu-panel/);
  assert.match(mainSource, /data-shiftbuilder-logout/);
  assert.match(mainSource, /mountAccountMenuLogout\(\)/);
  assert.match(mainSource, /DOMContentLoaded/);
  assert.match(mainSource, /button\.disabled = true/);
});

test("ログアウト時はFirebase認証と保存ユーザーを破棄してログイン画面へ戻す", () => {
  assert.match(authSource, /await signOut\(getShiftBuilderAuth\(\)\)/);
  assert.match(authSource, /clearShiftCoreSessionState\(\)/);
  assert.match(authSource, /window\.location\.assign\(getLoginUrl\(\)\)/);
});
