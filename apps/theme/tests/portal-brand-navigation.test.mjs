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
