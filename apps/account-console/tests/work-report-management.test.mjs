import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const backendSource = fs.readFileSync(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../work-report-admin.html", import.meta.url), "utf8");
const adminSource = fs.readFileSync(new URL("../js/work-report-admin/main.js", import.meta.url), "utf8");
const adminCss = fs.readFileSync(new URL("../css/work-report-admin.css", import.meta.url), "utf8");
const dashboardHtml = fs.readFileSync(new URL("../dashboard.html", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("../js/dashboard/main.js", import.meta.url), "utf8");
const dashboardCss = fs.readFileSync(new URL("../css/dashboard.css", import.meta.url), "utf8");

function backendContext() {
  const context = vm.createContext({
    Utilities: {
      formatDate: (date, _tz, format) => {
        if (format === "yyyy-MM-dd") return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
        return "2026/08/30 12:00";
      }
    },
    console
  });
  vm.runInContext(backendSource, context);
  return context;
}

test("同日複数案件はschedule_idで対象案件と店舗を確定する", () => {
  const context = backendContext();
  const record = { record_id: "R2", email: "member@example.com", "勤務日": "2026-08-30", "開発予定ID": "PLAN-2", schedule_id: "S2", "予定場所": "旧店舗名" };
  const schedules = [
    { schedule_id: "S1", email: "member@example.com", "勤務日": "2026-08-30", "開発予定ID": "PLAN-1", "開発予定名": "案件1", "稼働場所": "店舗1" },
    { schedule_id: "S2", email: "member@example.com", "勤務日": "2026-08-30", "開発予定ID": "PLAN-2", "開発予定名": "案件2", "稼働場所": "店舗2" }
  ];
  const result = context.workReportContext_(record, schedules);
  assert.equal(result.scheduleId, "S2");
  assert.equal(result.planName, "案件2");
  assert.equal(result.storeName, "店舗2");
});

test("schedule_idが壊れて他人の予定を指しても案件情報を流用しない", () => {
  const context = backendContext();
  const result = context.workReportContext_({ email: "member@example.com", "勤務日": "2026-08-30", "開発予定ID": "PLAN-MEMBER", "予定場所": "本人店舗", schedule_id: "OTHER-SCHEDULE" }, [
    { schedule_id: "OTHER-SCHEDULE", email: "other@example.com", "勤務日": "2026-08-30", "開発予定ID": "PLAN-OTHER", "開発予定名": "他人案件", "稼働場所": "他人店舗" }
  ]);
  assert.equal(result.planId, "PLAN-MEMBER");
  assert.equal(result.planName, "本人店舗");
  assert.equal(result.storeName, "本人店舗");
});

test("項目停止・改名後も回答時点のスナップショットを表示・集計できる", () => {
  const context = backendContext();
  const answer = context.publicWorkReportAnswer_({ item_id: "retired", "項目名": "旧項目名", "種別": "number", "カテゴリID": "old", "カテゴリ名": "旧カテゴリ", "表示順": 10, "定義版": 2, "数値回答": 3, "入力状態": "answered" });
  const aggregates = context.aggregateWorkReportAnswers_([
    { status: "提出済み", reportId: "REPORT-1", workDate: "2026-08-30", storeName: "店舗", reporterEmail: "member@example.com", reporterName: "担当者", planId: "PLAN", planName: "案件" }
  ], [{ reportId: "REPORT-1", answers: [answer] }], "store");
  assert.equal(answer.name, "旧項目名");
  assert.equal(aggregates[0].metrics[0].name, "旧項目名");
  assert.equal(aggregates[0].metrics[0].value, 3);
});

test("同じ項目IDでも名称やカテゴリが変わった回答は別の意味として集計する", () => {
  const context = backendContext();
  const submissions = [
    { status: "提出済み", reportId: "OLD", workDate: "2026-08-30", storeName: "店舗" },
    { status: "提出済み", reportId: "NEW", workDate: "2026-08-30", storeName: "店舗" }
  ];
  const details = [
    { reportId: "OLD", answers: [{ itemId: "same-id", version: 1, name: "旧名称", type: "number", categoryName: "旧カテゴリ", displayOrder: 1, value: 2 }] },
    { reportId: "NEW", answers: [{ itemId: "same-id", version: 2, name: "新名称", type: "number", categoryName: "新カテゴリ", displayOrder: 1, value: 3 }] }
  ];
  const metrics = context.aggregateWorkReportAnswers_(submissions, details, "store")[0].metrics;
  assert.equal(metrics.length, 2);
  assert.deepEqual(Array.from(metrics, metric => metric.name).sort(), ["旧名称", "新名称"].sort());
});

test("日別・月別・店舗別・人員別・案件別で同じ数値を集計する", () => {
  const context = backendContext();
  const submissions = [
    { status: "提出済み", reportId: "R1", workDate: "2026-08-30", storeName: "店舗A", reporterEmail: "a@example.com", reporterName: "A", planId: "P1", planName: "案件1" },
    { status: "提出済み", reportId: "R2", workDate: "2026-08-31", storeName: "店舗A", reporterEmail: "a@example.com", reporterName: "A", planId: "P1", planName: "案件1" }
  ];
  const details = ["R1", "R2"].map(reportId => ({ reportId, answers: [{ itemId: "sales", name: "販売数", type: "number", categoryName: "実績", displayOrder: 1, value: 2 }] }));
  for (const groupBy of ["day", "month", "store", "person", "plan"]) {
    const aggregates = context.aggregateWorkReportAnswers_(submissions, details, groupBy);
    const total = aggregates.reduce((sum, group) => sum + group.metrics.reduce((metricSum, metric) => metricSum + metric.value, 0), 0);
    assert.equal(total, 4, groupBy);
  }
  assert.equal(context.aggregateWorkReportAnswers_(submissions, details, "day").length, 2);
  assert.equal(context.aggregateWorkReportAnswers_(submissions, details, "month").length, 1);
});

test("旧形式は提出済みとして保持し、保存中だけ未完了にする", () => {
  const context = backendContext();
  assert.equal(context.isSubmittedWorkReport_({ report_id: "LEGACY", "保存状態": "" }), true);
  assert.equal(context.isSubmittedWorkReport_({ report_id: "PENDING", "保存状態": "保存中" }), false);
  assert.equal(context.isSubmittedWorkReport_({ report_id: "RETURNED", "保存状態": "差戻し中" }), false);
});

test("対象案件は案件名の文字列ではなく案件IDとテンプレートの明示対応で決める", () => {
  const context = backendContext();
  const mappings = [{ "開発予定ID": "PLAN-DOCOMO", template_id: "docomo", "有効": true }];
  const templates = [{ template_id: "docomo", "テンプレート名": "ドコモ案件", "有効": true }];
  assert.equal(context.workReportTemplateForContext_({ planId: "PLAN-DOCOMO", planName: "名称にキャリア表記なし" }, mappings, templates).templateId, "docomo");
  assert.equal(context.workReportTemplateForContext_({ planId: "PLAN-OTHER", planName: "ドコモショップ案件" }, mappings, templates), null);
});

test("対象案件候補は同じ案件を一件にまとめ、稼働日と人員名を添える", () => {
  const context = backendContext();
  context.rows_ = () => [];
  const candidates = context.workReportCaseCandidates_([
    { "開発予定ID": "PLAN-1", "開発予定名": "案件A", "勤務日": "2026-08-30", "氏名": "担当A" },
    { "開発予定ID": "PLAN-1", "開発予定名": "案件A", "勤務日": "2026-08-31", "氏名": "担当B" }
  ]);
  assert.equal(candidates.length, 1);
  assert.deepEqual(Array.from(candidates[0].workDates), ["2026-08-30", "2026-08-31"]);
  assert.deepEqual(Array.from(candidates[0].people), ["担当A", "担当B"]);
});

test("管理画面は未提出・集計・項目編集停止・CSV出力を備える", () => {
  for (const value of ["未提出", "差戻し中", "日別", "月別", "店舗別", "人員別", "案件別", "CSV出力", "修正履歴も出力", "実績項目管理", "実績報告の対象案件", "稼働日", "人員名", "案件名"]) assert.ok(adminHtml.includes(value), value);
  assert.match(adminSource, /attendanceRequest\("getWorkReportAdminData"/);
  assert.match(adminSource, /attendanceRequest\("saveWorkReportItem"/);
  assert.match(adminSource, /attendanceRequest\("saveWorkReportCaseMapping"/);
  assert.match(adminSource, /attendanceRequest\("returnWorkReport"/);
  assert.match(adminSource, /attendanceRequest\("exportWorkReportsCsv"/);
  assert.match(backendSource, /csv: "\\uFEFF" \+ csv/);
  assert.match(adminCss, /@media\(max-width:900px\)/);
  assert.match(adminCss, /\.table-wrap\{overflow:auto/);
});

test("個人ダッシュボードは勤怠を先に表示し、本人専用成績と予定同期を後から並行取得する", () => {
  assert.ok(dashboardHtml.includes("今月の成績"));
  assert.ok(dashboardHtml.includes("ログインしている本人の実績だけを表示します"));
  assert.match(dashboardHtml, /dashboard\/main\.js\?v=20260831-date-label-1/);
  assert.doesNotMatch(dashboardSource, /attendanceRequest\("getPortalBootstrap"/);
  assert.match(dashboardSource, /attendanceRequest\("getDashboardData"/);
  assert.match(dashboardSource, /attendanceRequest\("getMyWorkReportSummary"/);
  assert.match(dashboardSource, /secondaryLoads = \[loadMyWorkReportSummary\(loadVersion\)\]/);
  assert.match(dashboardSource, /!\["fresh-cache", "in-progress"\]\.includes\(syncStatus\)/);
  assert.match(dashboardSource, /Promise\.allSettled\(secondaryLoads\)/);
  assert.match(dashboardSource, /shiftcore_attendance_dashboard:\$\{dashboardEnvironment\}:/);
  assert.match(dashboardSource, /timing\?\.referenceCache/);
  assert.match(dashboardSource, /await loadDashboard\(\);\s+void refreshModuleAccess\(user\);/);
  assert.match(dashboardSource, /loadVersion !== dashboardLoadVersion/);
  assert.match(dashboardSource, /workReportSummary: null, workReportSummaryError: null/);
  assert.match(dashboardSource, /syncStatus === "fresh-cache"/);
  assert.match(dashboardSource, /sessionStorage\.setItem\("shiftcore_report_context", JSON\.stringify\(\{ recordId \}\)\)/);
  assert.match(dashboardCss, /\.performance-metrics/);
  assert.match(dashboardCss, /@media\(max-width:820px\)/);
});

test("管理者ダッシュボードから勤怠管理と実績報告管理へ直接移動できる", () => {
  assert.match(dashboardHtml, /id="adminLinks"[^>]*hidden/);
  assert.match(dashboardHtml, /href="\.\/attendance-admin\.html">勤怠管理<\/a>/);
  assert.match(dashboardHtml, /href="\.\/work-report-admin\.html">実績報告管理<\/a>/);
  assert.match(dashboardSource, /\$\("adminLinks"\)\.hidden = !data\.adminAccess/);
  assert.match(dashboardCss, /\.admin-links\[hidden\]\{display:none\}/);
});

test("実績管理APIは既存の勤怠管理者以外を拒否する", () => {
  const context = backendContext();
  assert.throws(() => context.getWorkReportAdminData_({ role: "member" }, {}), error => error.code === "FORBIDDEN");
  assert.throws(() => context.saveWorkReportItem_({ role: "member" }, {}), error => error.code === "FORBIDDEN");
  assert.throws(() => context.exportWorkReportsCsv_({ role: "member" }, {}), error => error.code === "FORBIDDEN");
});

test("CSVセルは数式として実行される先頭文字を無害化する", () => {
  const context = backendContext();
  assert.equal(context.csvCell_("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"');
  assert.equal(context.csvCell_("通常"), '"通常"');
  assert.equal(context.sheetText_("=1+1"), "'=1+1");
});
