import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const backendSource = readFileSync(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8");

test("共通ログイン応答へ既存のShiftBuilder権限を返す", () => {
  const source = readFileSync(new URL("../backend/account-apps-script/users.js", import.meta.url), "utf8");
  const context = vm.createContext({ buildPmoV2Url: () => "", console });
  vm.runInContext(source, context);
  const result = context.buildLoginUserResponse({
    email: "member@example.com",
    status: "active",
    base_area: "関西",
    allowed_modules: "shift",
    shiftbuilder_permission: "view"
  });
  assert.equal(result.shiftbuilder_permission, "view");
  assert.equal(result.base_area, "関西");
});

function createSheet(initialRows = []) {
  const values = initialRows.map(row => row.slice());
  const ensureCell = (row, column) => {
    while (values.length <= row) values.push([]);
    while (values[row].length <= column) values[row].push("");
  };
  return {
    values,
    appendRow: row => values.push(row.slice()),
    getDataRange: () => ({ getValues: () => values.map(row => row.slice()) }),
    getLastColumn: () => Math.max(1, ...values.map(row => row.length)),
    getLastRow: () => values.length,
    getRange: (row, column, rowCount = 1, columnCount = 1) => ({
      getValues: () => Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => values[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? "")),
      setValue: value => { ensureCell(row - 1, column - 1); values[row - 1][column - 1] = value; },
      setValues: rows => rows.forEach((sourceRow, rowOffset) => sourceRow.forEach((value, columnOffset) => { ensureCell(row - 1 + rowOffset, column - 1 + columnOffset); values[row - 1 + rowOffset][column - 1 + columnOffset] = value; }))
    }),
    setFrozenRows: () => {}
  };
}

function createAttendanceContext(records) {
  let uuid = 0;
  const sheets = {
    "勤怠記録": createSheet([
      ["record_id", "email", "氏名", "勤務日", "予定場所", "開発予定ID", "状態", "実終了", "正式終了", "schedule_id"],
      ...records.map(record => [record.record_id, record.email, record.name || "担当者", record.workDate || "2026-08-28", record.storeName || "店舗A", record.planId || "PLAN-1", record.status || "終了済み", record.actualEnd === undefined ? (record.status === "稼働中" ? "" : "2026-08-28T18:00:00+09:00") : record.actualEnd, record.formalEnd || "", record.scheduleId || ""])
    ]),
    "実績報告": createSheet([["report_id", "record_id", "開発予定ID", "開発予定名", "報告者メール", "報告者氏名", "実績内容", "課題・申し送り", "報告日時"]]),
    "実績テンプレート": createSheet([
      ["template_id", "テンプレート名", "有効", "作成日時", "更新日時"],
      ["docomo", "ドコモ案件", true, "", ""]
    ]),
    "実績対象案件": createSheet([
      ["mapping_id", "開発予定ID", "開発予定名", "template_id", "有効", "作成日時", "更新日時"],
      ["MAP-1", "PLAN-1", "案件1", "docomo", true, "", ""]
    ]),
    "通知": createSheet([["notification_id", "宛先メール", "宛先氏名", "種別", "タイトル", "本文", "対象ID", "既読", "送信状態", "作成日時", "既読日時"]])
  };
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => (sheets[name] = createSheet())
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActive: () => spreadsheet },
    Utilities: {
      getUuid: () => `UUID-${++uuid}`,
      formatDate: (date, _tz, format) => format === "yyyy-MM-dd" ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "2026/08/28 18:00"
    },
    LockService: {
      getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
    },
    console
  });
  vm.runInContext(backendSource, context);
  return { context, sheets };
}

function validAnswers() {
  return [
    { itemId: "responseCount", value: 0 },
    { itemId: "successfulActions", value: "声かけを工夫した" },
    { itemId: "measuresAndResults", value: "導線を変えて改善した" }
  ];
}

function reportPayload(recordId, token = `TOKEN-${recordId}`) {
  return { recordId, answers: validAnswers(), submissionToken: token };
}

test("実績報告はログイン本人の終了済み勤怠だけ受け付ける", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-1", email: " Member@Example.com " }]);
  const result = context.submitReport_({ email: "member@example.com", name: "担当者" }, reportPayload("REC-1"));
  assert.equal(result.ok, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("実績報告は他人・存在しない勤怠記録を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-OTHER", email: "other@example.com" }]);
  for (const recordId of ["REC-OTHER", "REC-MISSING"]) {
    assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload(recordId)), error => error.code === "REPORT_RECORD_FORBIDDEN");
  }
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("稼働終了前の実績報告を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-RUNNING", email: "member@example.com", status: "稼働中" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-RUNNING")), error => error.code === "REPORT_CLOCK_OUT_REQUIRED");
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("同じ勤怠記録の実績報告は再送しても二重登録しない", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-1", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-1", "FIRST"));
  const duplicate = context.submitReport_({ email: "member@example.com" }, reportPayload("REC-1", "RELOAD"));
  assert.equal(duplicate.duplicate, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("同じ再送トークンへ異なる回答を混ぜる操作を拒否する", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-TOKEN", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-TOKEN", "FIXED-TOKEN"));
  const changedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 9 } : answer);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, { recordId: "REC-TOKEN", answers: changedAnswers, submissionToken: "FIXED-TOKEN" }), error => error.code === "REPORT_SUBMISSION_RETRY_MISMATCH");
});

test("対象案件マスターにない終了済み勤怠は実績報告を拒否する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-OTHER-PLAN", email: "member@example.com", planId: "PLAN-OTHER" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-OTHER-PLAN")), error => error.code === "REPORT_NOT_REQUIRED");
  assert.equal(sheets["実績報告"].values.length, 1);
});

test("本人修正と差戻し後再提出は旧版回答を残して最新版だけを切り替える", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-EDIT", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com", name: "担当者" }, reportPayload("REC-EDIT", "EDIT-1"));
  const changedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 4 } : answer);
  const edited = context.submitReport_({ email: "member@example.com", name: "担当者" }, { recordId: "REC-EDIT", answers: changedAnswers, submissionToken: "EDIT-2" });
  assert.equal(edited.revisionNumber, 2);
  const reportHeaders = sheets["実績報告"].values[0];
  const reportId = sheets["実績報告"].values[1][reportHeaders.indexOf("report_id")];
  context.returnWorkReport_({ email: "admin@example.com", role: "admin" }, { reportId, reason: "応対数を再確認してください" });
  const resubmittedAnswers = changedAnswers.map(answer => answer.itemId === "responseCount" ? { ...answer, value: 5 } : answer);
  const resubmitted = context.submitReport_({ email: "member@example.com", name: "担当者" }, { recordId: "REC-EDIT", answers: resubmittedAnswers, submissionToken: "EDIT-3" });
  assert.equal(resubmitted.revisionNumber, 3);
  assert.equal(sheets["実績報告改訂"].values.length, 4);
  const revisionHeaders = sheets["実績報告改訂"].values[0];
  assert.deepEqual(sheets["実績報告改訂"].values.slice(1).map(row => row[revisionHeaders.indexOf("編集種別")]), ["初回提出", "本人修正", "差戻し後再提出"]);
  const answerHeaders = sheets["実績回答"].values[0];
  const responseRows = sheets["実績回答"].values.slice(1).filter(row => row[answerHeaders.indexOf("item_id")] === "responseCount");
  assert.deepEqual(responseRows.map(row => row[answerHeaders.indexOf("数値回答")]), [0, 4, 5]);
});

test("通信断相当の保存中報告は不足回答だけを補完して完了する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-RETRY", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-RETRY", "RETRY-TOKEN"));
  const reportHeaders = sheets["実績報告"].values[0];
  sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")] = "保存中";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_id")] = "";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_number")] = 0;
  const revisionHeaders = sheets["実績報告改訂"].values[0];
  sheets["実績報告改訂"].values[1][revisionHeaders.indexOf("状態")] = "保存中";
  sheets["実績回答"].values.pop();
  const restored = context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-RETRY" });
  assert.equal(restored.resuming, true);
  assert.equal(restored.resumeSubmissionToken, "RETRY-TOKEN");
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-RETRY", "NEW-TOKEN")), error => error.code === "REPORT_SUBMISSION_IN_PROGRESS");
  const retry = context.submitReport_({ email: "member@example.com" }, reportPayload("REC-RETRY", restored.resumeSubmissionToken));
  assert.equal(retry.ok, true);
  assert.equal(sheets["実績報告"].values.length, 2);
  assert.equal(sheets["実績回答"].values.length, 40);
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")], "提出済み");
});

test("回答版の確定直後に通信が切れても同じ送信で報告ヘッダーを復旧する", () => {
  const { context, sheets } = createAttendanceContext([{ record_id: "REC-FINALIZE", email: "member@example.com" }]);
  context.submitReport_({ email: "member@example.com" }, reportPayload("REC-FINALIZE", "FINALIZE-TOKEN"));
  const reportHeaders = sheets["実績報告"].values[0];
  const revisionHeaders = sheets["実績報告改訂"].values[0];
  const revisionId = sheets["実績報告改訂"].values[1][revisionHeaders.indexOf("revision_id")];
  sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")] = "保存中";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_id")] = "";
  sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_number")] = 0;
  const restored = context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-FINALIZE" });
  assert.equal(restored.resuming, true);
  assert.equal(restored.resumeSubmissionToken, "FINALIZE-TOKEN");
  const recovered = context.submitReport_({ email: "member@example.com" }, reportPayload("REC-FINALIZE", restored.resumeSubmissionToken));
  assert.equal(recovered.duplicate, true);
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("保存状態")], "提出済み");
  assert.equal(sheets["実績報告"].values[1][reportHeaders.indexOf("current_revision_id")], revisionId);
  assert.equal(sheets["実績回答"].values.length, 40);
});

test("承認済みの正式終了があれば実績報告できる", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-CORRECTED", email: "member@example.com", status: "修正済み", actualEnd: "", formalEnd: "2026-08-28T18:00:00+09:00" }]);
  assert.equal(context.submitReport_({ email: "member@example.com" }, reportPayload("REC-CORRECTED")).ok, true);
});

test("個人成績APIはログイン本人の対象勤怠と回答だけを返す", () => {
  const { context } = createAttendanceContext([
    { record_id: "REC-ME", email: "member@example.com", workDate: "2026-08-28" },
    { record_id: "REC-OTHER", email: "other@example.com", workDate: "2026-08-28" }
  ]);
  const myAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 3 } : answer);
  const otherAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 99 } : answer);
  context.submitReport_({ email: "member@example.com", name: "本人" }, { recordId: "REC-ME", answers: myAnswers, submissionToken: "MY-SUMMARY" });
  context.submitReport_({ email: "other@example.com", name: "他人" }, { recordId: "REC-OTHER", answers: otherAnswers, submissionToken: "OTHER-SUMMARY" });
  const summary = context.getMyWorkReportSummary_({ email: "member@example.com" }, { month: "2026-08" });
  assert.equal(summary.ownerEmail, "member@example.com");
  assert.equal(summary.counts.total, 1);
  assert.equal(summary.metrics.find(metric => metric.itemId === "responseCount").value, 3);
  assert.deepEqual(Array.from(summary.submissions, item => item.recordId), ["REC-ME"]);
});

test("ポータル初期表示は勤怠と個人成績を一括取得し、成績失敗時も勤怠を返す", () => {
  const { context } = createAttendanceContext([]);
  context.getDashboardData_ = () => ({ ok: true, today: "2026-08-28", marker: "dashboard" });
  context.getMyWorkReportSummary_ = () => ({ ok: true, ownerEmail: "member@example.com" });
  const success = context.getPortalBootstrap_({ email: "member@example.com" }, { month: "2026-08" });
  assert.equal(success.marker, "dashboard");
  assert.equal(success.workReportSummary.ownerEmail, "member@example.com");
  assert.equal(success.workReportSummaryError, null);
  assert.equal(typeof success.serverTiming.totalMs, "number");

  context.getMyWorkReportSummary_ = () => { throw context.apiError_("SUMMARY_FAILED", "成績集計に失敗"); };
  const partial = context.getPortalBootstrap_({ email: "member@example.com" }, { month: "2026-08" });
  assert.equal(partial.marker, "dashboard");
  assert.equal(partial.workReportSummary, null);
  assert.equal(partial.workReportSummaryError.code, "SUMMARY_FAILED");
});

test("背景予定同期は成功後5分の印だけを共有し、予定本体は勤怠シートから再読込する", () => {
  const { context } = createAttendanceContext([]);
  const cacheValues = new Map();
  context.CacheService = { getScriptCache: () => ({
    get: key => cacheValues.get(key) || null,
    put: (key, value) => cacheValues.set(key, value),
    remove: key => cacheValues.delete(key)
  }) };
  context.rows_ = () => [{ schedule_id: "LOCAL" }];
  let syncCalls = 0;
  context.syncSchedules_ = () => ({ schedules: [{ schedule_id: `SYNC-${++syncCalls}` }], synced: true });

  const first = context.getDashboardSchedules_("token");
  const second = context.getDashboardSchedules_("token");
  assert.equal(first.sync.status, "refreshed");
  assert.equal(first.schedules[0].schedule_id, "SYNC-1");
  assert.equal(second.sync.status, "fresh-cache");
  assert.equal(second.schedules[0].schedule_id, "LOCAL");
  assert.equal(syncCalls, 1);
  assert.ok(Array.from(cacheValues.values()).every(value => !value.includes("SYNC-1") && !value.includes("LOCAL")));
});

test("背景予定同期の失敗は印を消して次回再試行できる", () => {
  const { context } = createAttendanceContext([]);
  const cacheValues = new Map();
  context.CacheService = { getScriptCache: () => ({
    get: key => cacheValues.get(key) || null,
    put: (key, value) => cacheValues.set(key, value),
    remove: key => cacheValues.delete(key)
  }) };
  context.rows_ = () => [{ schedule_id: "LOCAL" }];
  let syncCalls = 0;
  context.syncSchedules_ = () => ({ schedules: [{ schedule_id: "LOCAL" }], synced: (++syncCalls, false) });
  assert.equal(context.getDashboardSchedules_("token").sync.status, "failed");
  assert.equal(context.getDashboardSchedules_("token").sync.status, "failed");
  assert.equal(syncCalls, 2);
  assert.equal(cacheValues.size, 0);
});

test("CSVは通常出力で最新版だけ、履歴出力で修正前後を含める", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-CSV", email: "member@example.com", workDate: "2026-08-28" }]);
  context.submitReport_({ email: "member@example.com", name: "本人" }, reportPayload("REC-CSV", "CSV-1"));
  const changedAnswers = validAnswers().map(answer => answer.itemId === "responseCount" ? { ...answer, value: 7 } : answer);
  context.submitReport_({ email: "member@example.com", name: "本人" }, { recordId: "REC-CSV", answers: changedAnswers, submissionToken: "CSV-2" });
  const filters = { dateFrom: "2026-08-01", dateTo: "2026-08-31", groupBy: "day" };
  const current = context.exportWorkReportsCsv_({ email: "admin@example.com", role: "admin" }, filters);
  const history = context.exportWorkReportsCsv_({ email: "admin@example.com", role: "admin" }, { ...filters, includeHistory: true });
  assert.ok(current.fileName.startsWith("work-reports_"));
  assert.ok(history.fileName.startsWith("work-reports-history_"));
  assert.equal(current.csv.split("\r\n").length, 40);
  assert.equal(history.csv.split("\r\n").length, 79);
  assert.ok(history.csv.includes('"初回提出"'));
  assert.ok(history.csv.includes('"本人修正"'));
});

test("案件の対象停止後も既存報告は履歴へ残し、新しい未提出勤怠だけ除外する", () => {
  const { context, sheets } = createAttendanceContext([
    { record_id: "REC-HISTORY", email: "member@example.com", workDate: "2026-08-27" },
    { record_id: "REC-AFTER-STOP", email: "member@example.com", workDate: "2026-08-28" }
  ]);
  context.submitReport_({ email: "member@example.com", name: "本人" }, reportPayload("REC-HISTORY", "HISTORY-1"));
  const mappingHeaders = sheets["実績対象案件"].values[0];
  sheets["実績対象案件"].values[1][mappingHeaders.indexOf("有効")] = false;
  const adminData = context.getWorkReportAdminData_({ email: "admin@example.com", role: "admin" }, { dateFrom: "2026-08-01", dateTo: "2026-08-31" });
  assert.deepEqual(Array.from(adminData.submissions, item => item.recordId), ["REC-HISTORY"]);
  const summary = context.getMyWorkReportSummary_({ email: "member@example.com" }, { month: "2026-08" });
  assert.deepEqual(Array.from(summary.submissions, item => item.recordId), ["REC-HISTORY"]);
  assert.equal(summary.submissions[0].editable, true);
  assert.equal(context.getWorkReportForm_({ email: "member@example.com" }, { recordId: "REC-HISTORY" }).ok, true);
});

test("終了済み状態だけで終了時刻がなければ実績報告を拒否する", () => {
  const { context } = createAttendanceContext([{ record_id: "REC-INCONSISTENT", email: "member@example.com", status: "終了済み", actualEnd: "", formalEnd: "" }]);
  assert.throws(() => context.submitReport_({ email: "member@example.com" }, reportPayload("REC-INCONSISTENT")), error => error.code === "REPORT_CLOCK_OUT_REQUIRED");
});

test("数値0と未入力を区別し、負数・小数・不正値を拒否する", () => {
  const { context } = createAttendanceContext([]);
  const definitions = [
    { item_id: "required", "項目名": "必須件数", "種別": "number", "必須": true },
    { item_id: "optional", "項目名": "任意件数", "種別": "number", "必須": false }
  ];
  const normalized = context.normalizeWorkReportAnswers_(definitions, [{ itemId: "required", value: 0 }]);
  assert.equal(normalized[0].inputState, "answered");
  assert.equal(normalized[1].value, 0);
  assert.equal(normalized[1].inputState, "defaulted");
  for (const value of [-1, 1.5, "abc"]) {
    assert.throws(() => context.normalizeWorkReportAnswers_(definitions, [{ itemId: "required", value }]), error => error.code === "REPORT_NUMBER_INVALID");
  }
});
