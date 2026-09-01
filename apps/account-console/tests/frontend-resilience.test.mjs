import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clearShiftCoreSessionState } from "../../common/logout-session.js";
import { createResponseGeneration } from "../../common/response-generation.js";

const environmentSource = readFileSync(new URL("../../common/environment.js", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../../theme/shiftcore-theme.css", import.meta.url), "utf8");
const loginHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const accountMain = readFileSync(new URL("../js/account-console/main.js", import.meta.url), "utf8");
const signupAdminMain = readFileSync(new URL("../js/signup-admin/main.js", import.meta.url), "utf8");
const pmoAdminMain = readFileSync(new URL("../js/pmo-admin/main.js", import.meta.url), "utf8");
const reportAdminMain = readFileSync(new URL("../js/work-report-admin/main.js", import.meta.url), "utf8");

function fakeStorage(entries) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); }
  };
}

test("応答世代は最後に開始したリクエストだけを現行扱いする", () => {
  const generation = createResponseGeneration();
  const first = generation.begin();
  const second = generation.begin();
  assert.equal(generation.isCurrent(first), false);
  assert.equal(generation.isCurrent(second), true);
  generation.invalidate();
  assert.equal(generation.isCurrent(second), false);
});

test("管理画面の非同期一覧は古い応答を描画しない", () => {
  for (const source of [accountMain, signupAdminMain, pmoAdminMain, reportAdminMain]) {
    assert.match(source, /createResponseGeneration/);
    assert.match(source, /\.begin\(\)/);
    assert.match(source, /\.isCurrent\(/);
  }
  assert.match(accountMain, /selectedUser\?\.internal_user_id !== selectedUserId/);
  assert.match(accountMain, /catch \(error\) \{\s+if \(!userLoadGeneration\.isCurrent\(generation\)\) return false;/);
  assert.match(accountMain, /catch \(error\) \{\s+if \(!organizationLoadGeneration\.isCurrent\(generation\) \|\| selectedUser\?\.internal_user_id !== selectedUserId\) return false;/);
  assert.match(accountMain, /if \(!await loadUsers\("再読み込み中\.\.\."\)\) return;/);
  assert.match(pmoAdminMain, /tableLoadGeneration\.invalidate\(\)/);
});

test("共通ログアウトは認証由来の一時状態だけを消しTEST環境選択を維持する", () => {
  const storage = fakeStorage({
    shiftcore_user: "user",
    shiftcore_signup_email: "mail",
    shiftcore_portal_user: "portal",
    shiftcore_report_context: "report",
    "shiftcore_shiftbuilder_bootstrap:staging:user": "cache",
    "shiftbuilder-read-v1:user:0:bootstrap::all": "read-cache",
    shiftcore_environment: "staging",
    unrelated: "keep"
  });
  clearShiftCoreSessionState(storage);
  for (const key of ["shiftcore_user", "shiftcore_signup_email", "shiftcore_portal_user", "shiftcore_report_context", "shiftcore_shiftbuilder_bootstrap:staging:user", "shiftbuilder-read-v1:user:0:bootstrap::all"]) {
    assert.equal(storage.has(key), false, key);
  }
  assert.equal(storage.has("shiftcore_environment"), true);
  assert.equal(storage.has("unrelated"), true);
});

test("共通ログアウトはStorage拒否でも画面遷移側へ例外を漏らさない", () => {
  assert.doesNotThrow(() => clearShiftCoreSessionState({
    removeItem() { throw new Error("blocked"); }
  }));
});

test("TESTバナーは実測高さをCSS変数へ反映し追従UIの重なりを防ぐ", () => {
  assert.match(environmentSource, /--shiftcore-environment-banner-height/);
  assert.match(environmentSource, /ResizeObserver/);
  assert.match(themeCss, /var\(--shiftcore-environment-banner-height, 40px\)/);
});

test("ログイン画面はmainランドマークと通知可能な状態表示を持つ", () => {
  assert.match(loginHtml, /<main class="container">/);
  assert.match(loginHtml, /id="statusBox"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(loginHtml, /id="loginBtn" type="button"/);
});
