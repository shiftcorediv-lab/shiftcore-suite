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
  assert.match(orderNavigation, /<h1>オーダー<\/h1>/);
  assert.doesNotMatch(orderCreate, />Shiftの/);
  assert.match(shiftPage, /<h1>シフト<\/h1>/);
  assert.match(shiftPage, />\s*ダッシュボードへ戻る\s*</);
});
