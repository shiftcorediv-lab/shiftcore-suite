import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const themeCss = read("../../theme/shiftcore-theme.css");
const activitySource = read("../js/common/activity.js");
const dashboardHtml = read("../dashboard.html");
const dashboardCss = read("../css/dashboard.css");
const dashboardSource = read("../js/dashboard/main.js");
const attendanceHtml = read("../attendance-admin.html");
const attendanceSource = read("../js/attendance-admin/main.js");
const reportHtml = read("../work-report.html");
const reportSource = read("../js/work-report/main.js");
const reportAdminHtml = read("../work-report-admin.html");
const reportAdminSource = read("../js/work-report-admin/main.js");
const loginHtml = read("../index.html");
const orderCss = read("../../ordercase/css/common.css");
const shiftCss = read("../../shiftbuilder/css/shiftbuilder.css");

test("共通読込表示は回転し、動きを減らす設定にも対応する", () => {
  assert.match(themeCss, /\[data-shiftcore-loading="true"\]::before/);
  assert.match(themeCss, /@keyframes shiftcore-activity-spin/);
  assert.match(themeCss, /prefers-reduced-motion: reduce/);
  assert.match(activitySource, /element\.dataset\.shiftcoreLoading = "true"/);
  assert.match(activitySource, /element\.setAttribute\("aria-busy", "true"\)/);
  assert.match(activitySource, /delete element\.dataset\.shiftcoreLoading/);
});

test("ポータル・勤怠・実績・ログインの初期表示と通信中に活動表示を切り替える", () => {
  for (const html of [dashboardHtml, attendanceHtml, reportHtml, reportAdminHtml, loginHtml]) {
    assert.match(html, /data-shiftcore-loading="true"/);
    assert.match(html, /aria-busy="true"/);
  }
  for (const source of [dashboardSource, attendanceSource, reportSource, reportAdminSource]) {
    assert.match(source, /setActivity/);
  }
  assert.match(dashboardSource, /処理を送信しています/);
  assert.match(attendanceSource, /勤怠情報を読み込んでいます/);
  assert.match(reportSource, /送信しています/);
  assert.match(reportAdminSource, /CSVを準備しています/);
});

test("既存のOrderとShiftの全画面ローダーも維持する", () => {
  assert.match(orderCss, /\.spinner\s*\{/);
  assert.match(orderCss, /animation:/);
  assert.match(shiftCss, /\.loading-spinner\s*\{/);
  assert.match(shiftCss, /animation:/);
});

test("ダッシュボードの現状表示は先頭側へ配置し、表示域内へ追従する", () => {
  assert.ok(dashboardHtml.indexOf('id="statusBox"') < dashboardHtml.indexOf('class="hero-grid"'));
  assert.match(dashboardHtml, /dashboard\.css\?v=20260831-sticky-status-1/);
  assert.match(dashboardCss, /\.status-box\{position:sticky;top:84px/);
  assert.match(dashboardCss, /data-shiftcore-environment="staging"\] \.status-box\{top:124px/);
});

test("ダッシュボードの日付は年月日を省略せず表示する", () => {
  assert.match(dashboardSource, /month: "numeric"/);
  assert.match(dashboardSource, /\$\{part\("year"\)\}年\$\{part\("month"\)\}月\$\{part\("day"\)\}日/);
  assert.match(dashboardHtml, /main\.js\?v=20260831-date-label-1/);
});
