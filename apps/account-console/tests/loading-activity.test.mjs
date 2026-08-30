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
  assert.match(dashboardHtml, /main\.js\?v=20260831-departure-location-1/);
});

test("最新勤怠の取得前は非稼働と断定せず稼働予定を読込中にする", () => {
  const loadStart = dashboardSource.indexOf("async function loadDashboard()");
  const loadingRender = dashboardSource.indexOf("renderDashboardLoading({", loadStart);
  const attendanceRequest = dashboardSource.indexOf('attendanceRequest("getDashboardData"', loadStart);

  assert.ok(loadStart >= 0);
  assert.ok(loadingRender > loadStart && loadingRender < attendanceRequest);
  assert.match(dashboardSource, /setActivity\(\$\("workStatus"\), true, preserveSchedule \? "更新中" : "確認中"\)/);
  assert.match(dashboardSource, /setActivity\(\$\("workLocation"\), true, "稼働予定を読み込んでいます…"\)/);
  assert.match(dashboardSource, /\$\("startBtn"\)\.disabled = true/);
  assert.match(dashboardSource, /\$\("startBtn"\)\.disabled = false/);
  assert.match(dashboardSource, /cachedDashboard\.schedule \|\| cachedDashboard\.record/);
});

test("予定同期が続く間も非稼働へ切り替えず読込表示を維持する", () => {
  assert.match(dashboardSource, /isScheduleSyncPending\(dashboardData\)/);
  assert.match(dashboardSource, /!data\?\.schedule && !data\?\.record && \["stale", "in-progress"\]\.includes\(syncStatus\)/);
  assert.match(dashboardSource, /refreshDashboardInBackground\(loadVersion, retryCount \+ 1\)/);
  assert.match(dashboardSource, /MAX_SCHEDULE_SYNC_RETRIES = 6/);
  assert.match(dashboardSource, /最新予定の同期に失敗しました。再読み込みしてください。/);
});
