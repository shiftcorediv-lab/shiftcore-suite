import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("利用者向けの主要機能名を日本語で表示する", () => {
  const dashboard = read("../dashboard.html");
  const dashboardConfig = read("../js/dashboard/config.js");
  const accountConsole = read("../account-console.html");
  const accountUi = read("../js/account-console/ui.js");
  const accountPortal = read("../account-portal.html");
  const pmoPortal = read("../pmo-portal.html");
  const signupAdmin = read("../signup-admin.html");
  const orderCreate = read("../../ordercase/index.html");
  const orderNavigation = read("../../ordercase/js/navigation.js");
  const shiftPage = read("../../shiftbuilder/index.html");

  assert.match(dashboard, /<span class="section-label">勤怠報告<\/span>/);
  assert.doesNotMatch(dashboard, />ATTENDANCE</);
  assert.match(dashboardConfig, /ordercase: "オーダー"/);
  assert.match(dashboardConfig, /shift: "シフト"/);
  assert.match(dashboardConfig, /account_console: "メンバー"/);
  assert.match(dashboardConfig, /pmo: "オフ"/);
  assert.match(accountConsole, /<th>オーダー<\/th>/);
  assert.match(accountConsole, /<th>シフト<\/th>/);
  assert.match(accountConsole, /<h1>メンバー<\/h1>/);
  assert.match(accountConsole, />\s*オフ\s*</);
  assert.doesNotMatch(accountUi, /メンバー（旧アカウント基盤）|取扱説明書（未公開・無効）/);
  assert.match(accountUi, /formatJapaneseDateTime\(log\.changed_at\)/);
  assert.match(accountPortal, /<h1>メンバー<\/h1>/);
  assert.doesNotMatch(accountPortal, /アカウント基盤|Account Portal/);
  assert.match(pmoPortal, /<label>アカウント種別<\/label>/);
  assert.doesNotMatch(signupAdmin, /保存値：|pmo,ordercase/);
  assert.match(signupAdmin, /<option value="pmo">オフ<\/option>/);
  assert.match(orderNavigation, /<h1>オーダー<\/h1>/);
  assert.doesNotMatch(orderCreate, />Shiftの/);
  assert.match(shiftPage, /<h1>シフト<\/h1>/);
  assert.match(shiftPage, />\s*ダッシュボードへ戻る\s*</);
});
