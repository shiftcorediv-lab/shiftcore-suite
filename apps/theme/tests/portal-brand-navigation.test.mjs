import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relativePath => readFile(new URL(relativePath, import.meta.url), "utf8");

const [themeCss, memberHtml, pmoHtml, shiftHtml, orderNavigation] = await Promise.all([
  read("../shiftcore-theme.css"),
  read("../../account-console/account-console.html"),
  read("../../pmo/index.html"),
  read("../../shiftbuilder/index.html"),
  read("../../ordercase/js/navigation.js"),
]);

test("主要モジュールに共通のAnother Portalロゴを表示する", () => {
  assert.match(themeCss, /\.portal-brand\s*\{/);
  assert.match(themeCss, /\.portal-brand-mark\s*\{/);
  assert.match(themeCss, /\.portal-module-heading\s*\{/);

  for (const source of [memberHtml, pmoHtml, shiftHtml, orderNavigation]) {
    assert.match(source, /class="portal-brand/);
    assert.match(source, /class="portal-module-heading/);
    assert.match(source, /Another Portal ダッシュボードへ戻る/);
    assert.match(source, /WORKFORCE PLATFORM/);
  }
});

test("主要モジュールのヘッダー外観と操作位置を共通化する", () => {
  assert.match(themeCss, /\.portal-module-header\s*\{/);
  assert.match(themeCss, /\.portal-module-header-main\s*\{/);
  assert.match(memberHtml, /class="header portal-module-header"/);
  assert.match(pmoHtml, /class="pmo-header portal-module-header"/);
  assert.match(shiftHtml, /class="header portal-module-header"/);
  assert.match(orderNavigation, /portal-module-header--stacked/);
  assert.match(orderNavigation, /class="header-actions portal-module-actions"/);
  assert.match(orderNavigation, /<div class="portal-module-header-main">[\s\S]*?<nav class="top-nav">/);
  assert.match(orderNavigation, /headerActions\.appendChild\(accountMenu\)/);
  assert.match(
    themeCss,
    /@media \(max-width: 720px\)[\s\S]*?\.portal-module-header-main\s*\{[\s\S]*?flex-direction:\s*column/,
  );
  assert.match(
    themeCss,
    /@media \(max-width: 520px\)[\s\S]*?\.portal-brand-copy\s*\{[\s\S]*?display:\s*none/,
  );
});

test("ロゴは固定ホストではなく同一環境のダッシュボードへ戻る", () => {
  assert.match(memberHtml, /class="portal-brand" href="\.\/dashboard\.html"/);

  for (const source of [pmoHtml, shiftHtml]) {
    assert.match(
      source,
      /class="portal-brand" href="\.\.\/account-console\/dashboard\.html"/,
    );
  }

  assert.match(orderNavigation, /ORDERCASE_DASHBOARD_URL = '\.\.\/account-console\/dashboard\.html'/);
  assert.match(orderNavigation, /href="\$\{ORDERCASE_DASHBOARD_URL\}"/);
  assert.doesNotMatch(
    `${memberHtml}\n${pmoHtml}\n${shiftHtml}\n${orderNavigation}`,
    /another-portal-router|shiftcorediv-lab\.github\.io/,
  );
});
