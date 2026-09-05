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
const signupRequestHtml = read("../signup-request.html");
const signupRequestSource = read("../js/signup-request/main.js");
const pmoHtml = read("../../pmo/index.html");
const pmoMainSource = read("../../pmo/js/main.js");
const pmoRequestSource = read("../../pmo/js/request.js");
const pmoUiSource = read("../../pmo/js/ui.js");
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

test("希望休と利用申請も本人確認・読込・送信中を共通表示する", () => {
  for (const html of [pmoHtml, signupRequestHtml]) {
    assert.match(html, /data-shiftcore-loading="true"/);
    assert.match(html, /aria-busy="true"/);
  }
  for (const source of [pmoMainSource, pmoUiSource, signupRequestSource]) {
    assert.match(source, /setActivity/);
  }
  assert.match(pmoMainSource, /ログインユーザーを確認中\.\.\.", "", true/);
  assert.match(pmoRequestSource, /提出済み内容を確認中\.\.\.", "", true/);
  assert.match(pmoMainSource, /希望休を送信中\.\.\./);
  assert.match(signupRequestSource, /利用申請を送信中\.\.\./);
});

test("ダッシュボードの現状表示は先頭側へ配置し、表示域内へ追従する", () => {
  assert.ok(dashboardHtml.indexOf('id="statusBox"') < dashboardHtml.indexOf('class="hero-grid"'));
  assert.match(dashboardHtml, /dashboard\.css\?v=20260831-work-report-alert-1/);
  assert.match(dashboardCss, /\.status-box\{position:sticky;top:84px/);
  assert.match(dashboardCss, /data-shiftcore-environment="staging"\] \.status-box\{top:124px/);
});

test("ダッシュボードの日付は年月日を省略せず表示する", () => {
  assert.match(dashboardSource, /month: "numeric"/);
  assert.match(dashboardSource, /\$\{part\("year"\)\}年\$\{part\("month"\)\}月\$\{part\("day"\)\}日/);
  assert.match(dashboardHtml, /main\.js\?v=20260905-order-sync-1/);
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
  assert.match(dashboardSource, /preserveSchedule: Boolean\(refreshed\.schedule \|\| refreshed\.record \|\| dashboardData\?\.schedule \|\| dashboardData\?\.record\)/);
  assert.match(dashboardSource, /refreshDashboardInBackground\(loadVersion, retryCount \+ 1,/);
  assert.match(dashboardSource, /MAX_SCHEDULE_SYNC_RETRIES = 6/);
  assert.match(dashboardSource, /最新予定の同期に失敗しました。再読み込みしてください。/);
});

test("ダッシュボードの予定同期表示は利用者向けのシフト名称で統一する", () => {
  assert.doesNotMatch(dashboardSource, /SB(?:の|同期)/);
  assert.match(dashboardSource, /シフトの予定は最新です/);
  assert.match(dashboardSource, /シフトの最新予定を勤怠へ反映しました/);
  assert.match(dashboardSource, /シフト同期に失敗しました/);
  assert.match(dashboardHtml, /main\.js\?v=20260905-order-sync-1/);
});

test("案件登録・編集の通知を受けた時だけダッシュボード予定を強制同期する", () => {
  assert.match(dashboardSource, /SHIFTBUILDER_DATA_REVISION_KEY = "shiftcore-shiftbuilder-data-revision-v1"/);
  assert.match(dashboardSource, /needsShiftScheduleRefresh\(shiftDataRevision\)/);
  assert.match(dashboardSource, /forceScheduleRefresh: options\.forceScheduleRefresh === true/);
  assert.match(dashboardSource, /shiftDataRevision: options\.shiftDataRevision \|\| ""/);
  assert.match(dashboardSource, /event\.key === SHIFTBUILDER_DATA_REVISION_KEY/);
  assert.match(dashboardHtml, /main\.js\?v=20260905-order-sync-1/);
});
