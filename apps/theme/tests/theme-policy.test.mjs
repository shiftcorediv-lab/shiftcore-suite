import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relativePath => readFile(new URL(relativePath, import.meta.url), "utf8");

const [source, fieldResponsiveCss, dashboardHtml, workReportHtml, pmoHtml] = await Promise.all([
  read("../shiftcore-theme.js"),
  read("../portal-field-responsive.css"),
  read("../../account-console/dashboard.html"),
  read("../../account-console/work-report.html"),
  read("../../pmo/index.html"),
]);

test("未選択時は従来表示のライトモードを使う", () => {
  assert.match(source, /return storedTheme\(\) \|\| "light"/);
});

test("テーマ切り替えをアカウントメニューへ配置する", () => {
  assert.match(source, /userMenuPanel/);
  assert.match(source, /アカウント・表示設定を開く/);
  assert.match(source, /data-shiftcore-theme-option/);
  assert.doesNotMatch(source, /shiftcore-theme-toggle/);
});

test("画面幅と入力方法から表示モードを自動判定する", () => {
  assert.match(source, /matchMedia\("\(max-width: 720px\)"\)/);
  assert.match(source, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(source, /root\.dataset\.portalLayout = mobileLayoutQuery\.matches \? "mobile" : "desktop"/);
  assert.match(source, /root\.dataset\.portalInput = coarsePointerQuery\.matches \? "touch" : "pointer"/);
  assert.match(source, /addEventListener\("change", applyPresentationMode\)/);
});

test("現場向け画面だけへスマホ優先レイアウトを適用する", () => {
  assert.match(fieldResponsiveCss, /data-portal-layout="mobile"/);
  assert.match(fieldResponsiveCss, /data-portal-surface="field"/);
  assert.match(fieldResponsiveCss, /\.work-details/);
  assert.match(fieldResponsiveCss, /min-height:\s*52px/);

  for (const html of [dashboardHtml, workReportHtml, pmoHtml]) {
    assert.match(html, /<body data-portal-surface="field">/);
    assert.match(html, /portal-field-responsive\.css\?v=20260903-responsive-layout-1/);
  }
});
