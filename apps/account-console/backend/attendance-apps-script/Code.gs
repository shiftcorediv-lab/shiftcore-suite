const ATTENDANCE_PRODUCTION_SCRIPT_ID = "1tsjulGLiTCpX8dG66cdqR0E0rx2ntKcKpRxwr_6H_UYy5FExuZgmNi-Y";

function attendanceRuntimeEnvironment_() {
  if (typeof ScriptApp === "undefined" || typeof PropertiesService === "undefined") return "unit-test";
  const explicit = String(PropertiesService.getScriptProperties().getProperty("SHIFTCORE_ENVIRONMENT") || "").trim().toLowerCase();
  const scriptId = String(ScriptApp.getScriptId() || "");
  if (scriptId === ATTENDANCE_PRODUCTION_SCRIPT_ID) {
    if (explicit && explicit !== "production") throw new Error("本番勤怠GASの環境設定が不正です。");
    return "production";
  }
  if (explicit !== "staging") throw new Error("勤怠GASはSHIFTCORE_ENVIRONMENT=stagingの明示設定が必要です。");
  return "staging";
}

function attendanceRequiredConfig_(key, productionValue) {
  const environment = attendanceRuntimeEnvironment_();
  if (environment === "production" || environment === "unit-test") return productionValue;
  const value = String(PropertiesService.getScriptProperties().getProperty(key) || "").trim();
  if (!value) throw new Error("テスト環境の必須設定がありません: " + key);
  return value;
}

function sendAttendanceMail_(options) {
  const mail = Object.assign({}, options || {});
  if (attendanceRuntimeEnvironment_() === "staging") {
    mail.to = attendanceRequiredConfig_("NOTIFICATION_EMAIL_OVERRIDE", "");
    mail.cc = "";
    mail.bcc = "";
    mail.subject = "[TEST] " + String(mail.subject || "ShiftCore通知");
  }
  return MailApp.sendEmail(mail);
}

const LOGIN_PROXY_URL = attendanceRequiredConfig_("SHIFTCORE_LOGIN_API_URL", "https://shiftcore-login-proxy.shiftcore-div.workers.dev/");
const ACCOUNT_APPROVAL_API_URL = "https://script.google.com/macros/s/AKfycbx83rAzXDfQPJUEu9tX4dpULH4QHYUoqfaTnfzzySkW3KjGVbcH4tnq9PKCCvfuEx6eRA/exec";
const ACCOUNT_APPROVAL_API_RUNTIME_URL = attendanceRequiredConfig_("SHIFTCORE_ACCOUNT_API_URL", ACCOUNT_APPROVAL_API_URL);
const SHIFTBUILDER_API_URL = attendanceRequiredConfig_("SHIFTBUILDER_API_URL", "https://script.google.com/macros/s/AKfycbxlWX3iPy6b1LDjKDc91G7jvBHeee4b5kr7o2wBYy859Uv_R-XI9tLzB2Xu6fz4_-5X/exec");
const TZ = "Asia/Tokyo";
const DEFAULT_WORK_REPORT_TEMPLATE_ID = "docomo";
const DASHBOARD_SCHEDULE_SYNC_TTL_SECONDS = 300;
const DASHBOARD_SCHEDULE_SYNC_IN_PROGRESS_SECONDS = 120;
const DASHBOARD_REFERENCE_CACHE_TTL_SECONDS = 900;
const DASHBOARD_REFERENCE_CACHE_VERSION_SECONDS = 21600;
const DASHBOARD_RECORD_CACHE_TTL_SECONDS = 900;
const DASHBOARD_READ_AUTH_CACHE_TTL_SECONDS = 900;

const SHEETS = {
  records: "勤怠記録",
  requests: "修正・予定外申請",
  notifications: "通知",
  settings: "設定",
  schedules: "稼働予定",
  reports: "実績報告",
  reportTemplates: "実績テンプレート",
  reportCaseMappings: "実績対象案件",
  reportRevisions: "実績報告改訂",
  reportItems: "実績項目",
  reportAnswers: "実績回答",
  fieldReports: "現場報告"
};

const HEADERS = {
  reports: ["report_id", "record_id", "開発予定ID", "開発予定名", "報告者メール", "報告者氏名", "実績内容", "課題・申し送り", "報告日時"],
  reportContract: ["勤務日", "店舗名", "schedule_id", "保存状態", "項目定義版", "template_id", "current_revision_id", "current_revision_number", "差戻し理由", "差戻し日時", "差戻し者メール"],
  reportTemplates: ["template_id", "テンプレート名", "有効", "作成日時", "更新日時"],
  reportCaseMappings: ["mapping_id", "開発予定ID", "開発予定名", "template_id", "有効", "有効開始日時", "有効終了日時", "作成日時", "更新日時"],
  reportRevisions: ["revision_id", "report_id", "record_id", "改訂番号", "状態", "編集者メール", "編集者氏名", "編集種別", "submission_token", "作成日時", "提出日時"],
  reportRevisionReturnContract: ["差戻し理由", "差戻し日時", "差戻し者メール"],
  reportItems: ["item_id", "template_id", "項目名", "種別", "カテゴリID", "カテゴリ名", "表示順", "必須", "有効", "定義版", "ダッシュボード表示", "ダッシュボード名", "ダッシュボード順", "作成日時", "更新日時"],
  reportAnswers: ["answer_id", "report_id", "revision_id", "record_id", "item_id", "定義版", "項目名", "種別", "カテゴリID", "カテゴリ名", "表示順", "数値回答", "文章回答", "入力状態", "作成日時"],
  fieldReports: ["field_report_id", "勤務日", "開発予定ID", "報告種別", "報告者メール", "報告者氏名", "報告日時", "schedule_id"],
  requests: ["request_id", "record_id", "種別", "申請者メール", "申請者氏名", "実勤務日", "申請開始", "申請終了", "理由区分", "理由詳細", "状態", "承認者メール", "承認者氏名", "承認理由", "申請日時", "処理日時"],
  requestContract: ["applicant_internal_user_id", "request_version", "approval_reviewer_internal_user_id", "applicant_organization_version"]
};

const DEFAULT_WORK_REPORT_ITEMS = [
  ["responseCount", "応対数", "number", "basic", "基本情報", 10, true],
  ["u39Mnp", "U39 MNP", "number", "mnp", "MNP・純新規", 20, false],
  ["over40Mnp", "40 Over MNP", "number", "mnp", "MNP・純新規", 30, false],
  ["u39New", "U39 純新規", "number", "mnp", "MNP・純新規", 40, false],
  ["over40New", "40 Over 純新規", "number", "mnp", "MNP・純新規", 50, false],
  ["smartphoneSales", "スマホ総販", "number", "device", "機種変更・プラン変更", 60, false],
  ["outsideSalesSmartphones", "内）販売外スマホ総販", "number", "device", "機種変更・プラン変更", 70, false],
  ["highEndAndroid", "内）ハイエンドAndroid", "number", "device", "機種変更・プラン変更", 80, false],
  ["highEndIphone", "内）ハイエンドiPhone", "number", "device", "機種変更・プラン変更", 90, false],
  ["usedSmartphones", "内）中古スマホ", "number", "device", "機種変更・プラン変更", 100, false],
  ["makerIncentiveHigh", "内）メーカーインセ（ハイエンド）", "number", "device", "機種変更・プラン変更", 110, false],
  ["makerIncentiveMiddle", "内）メーカーインセ（ミドル）", "number", "device", "機種変更・プラン変更", 120, false],
  ["docomoPoikatsuMax", "ドコモポイ活MAX移行", "number", "device", "機種変更・プラン変更", 130, false],
  ["docomoMax", "ドコモMAX移行", "number", "device", "機種変更・プラン変更", 140, false],
  ["dValuePass", "dバリューパス", "number", "option", "オプションサービス", 150, false],
  ["securityStandard", "あんしんセキュリティスタンダード（詐欺含む）", "number", "option", "オプションサービス", 160, false],
  ["amazonPrimeNew", "AmazonPrime（新規）", "number", "option", "オプションサービス", 170, false],
  ["amazonPrimeExisting", "AmazonPrime（既存）", "number", "option", "オプションサービス", 180, false],
  ["agekyun", "アゲキュン（Disney+、Netflix等）", "number", "option", "オプションサービス", 190, false],
  ["docomoHikari10g", "ドコモ光（10ギガ）", "number", "home", "イエナカ", 200, false],
  ["docomoHikari1g", "ドコモ光（1ギガ）", "number", "home", "イエナカ", 210, false],
  ["home5g", "Home 5g", "number", "home", "イエナカ", 220, false],
  ["dCardPlatinum", "dカードPlatinum", "number", "cashless", "キャッシュレス", 230, false],
  ["dCardGold", "dカードGOLD", "number", "cashless", "キャッシュレス", 240, false],
  ["dCardGoldU", "dカードGOLD U", "number", "cashless", "キャッシュレス", 250, false],
  ["docomoDenkiGreen", "ドコモでんき（Green）", "number", "energy", "エネルギー", 260, false],
  ["docomoDenkiBasic", "ドコモでんき（Basic）", "number", "energy", "エネルギー", 270, false],
  ["docomoGas", "ドコモガス", "number", "energy", "エネルギー", 280, false],
  ["securityService", "セキュリティサービス", "number", "affiliate", "アフィリエイト", 290, false],
  ["adBlock", "広告ブロック", "number", "affiliate", "アフィリエイト", 300, false],
  ["backupService", "バックアップサービス", "number", "affiliate", "アフィリエイト", 310, false],
  ["fraudCallProtection", "詐欺電話対策", "number", "affiliate", "アフィリエイト", 320, false],
  ["compensationService", "補償サービス", "number", "affiliate", "アフィリエイト", 330, false],
  ["coatingBoth", "コーティング（両面）", "number", "margin", "粗利商材", 340, false],
  ["coatingOne", "コーティング（片面）", "number", "margin", "粗利商材", 350, false],
  ["successfulActions", "成果につながった行動", "text", "qualitative", "定性報告", 360, true],
  ["underperformanceReason", "実績不振の理由", "text", "qualitative", "定性報告", 370, false],
  ["measuresAndResults", "実施した対策と結果", "text", "qualitative", "定性報告", 380, true],
  ["executiveNotes", "役員への報告・申し送り", "text", "qualitative", "定性報告", 390, false]
];

function doGet(e) {
  return jsonOutput_({ ok: true, service: "shiftcore-attendance", environment: attendanceRuntimeEnvironment_(), now: nowIso_() });
}

function doPost(e) {
  try {
    const requestStartedAt = Date.now();
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = String(body.action || "");
    const user = resolveUser_(body.idToken, { allowReadCache: ["getPortalBootstrap", "getDashboardData", "getMyWorkReportSummary"].includes(action) });
    const authenticatedAt = Date.now();
    const payload = body.payload || {};

    if (action === "getPortalBootstrap") return jsonOutput_(getPortalBootstrap_(user, payload));
    if (action === "getDashboardData") {
      const startedAt = Date.now();
      const dashboard = getDashboardData_(user, null, payload.scheduleId);
      const completedAt = Date.now();
      const readTiming = dashboard._serverTiming || {};
      delete dashboard._serverTiming;
      dashboard.scheduleSync = dashboardScheduleSyncStatus_();
      dashboard.serverTiming = {
        authMs: authenticatedAt - requestStartedAt,
        referenceMs: Number(readTiming.referenceMs) || 0,
        recordsMs: Number(readTiming.recordsMs) || 0,
        recordsCache: readTiming.recordsCache || "disabled",
        assembleMs: Number(readTiming.assembleMs) || 0,
        referenceCache: readTiming.referenceCache || "disabled",
        dashboardMs: completedAt - startedAt,
        totalMs: completedAt - requestStartedAt
      };
      return jsonOutput_(dashboard);
    }
    if (action === "refreshDashboardData") {
      const startedAt = Date.now();
      const scheduleResult = getDashboardSchedules_(body.idToken);
      const scheduleCompletedAt = Date.now();
      const dashboard = getDashboardData_(user, scheduleResult.schedules, payload.scheduleId);
      const completedAt = Date.now();
      const readTiming = dashboard._serverTiming || {};
      delete dashboard._serverTiming;
      return jsonOutput_(Object.assign(dashboard, {
        scheduleSync: scheduleResult.sync,
        serverTiming: {
          authMs: authenticatedAt - requestStartedAt,
          scheduleSyncMs: scheduleCompletedAt - startedAt,
          referenceMs: Number(readTiming.referenceMs) || 0,
          recordsMs: Number(readTiming.recordsMs) || 0,
          recordsCache: readTiming.recordsCache || "disabled",
          assembleMs: Number(readTiming.assembleMs) || 0,
          referenceCache: readTiming.referenceCache || "disabled",
          dashboardMs: completedAt - scheduleCompletedAt,
          totalMs: completedAt - requestStartedAt
        }
      }));
    }
    if (action === "clockIn") return jsonOutput_(withDashboardReferenceInvalidation_(user, () => clockIn_(user, payload, body.idToken)));
    if (action === "arrive") return jsonOutput_(withDashboardReferenceInvalidation_(user, () => arrive_(user, payload, body.idToken)));
    if (action === "clockOut") return jsonOutput_(withDashboardReferenceInvalidation_(user, () => clockOut_(user, payload, body.idToken)));
    if (action === "submitFieldReport") return jsonOutput_(withDashboardReferenceInvalidation_(user, () => submitFieldReport_(user, payload, body.idToken)));
    if (action === "submitCorrection") return jsonOutput_(withAllDashboardReferenceInvalidation_(() => submitCorrection_(user, payload, body.idToken)));
    if (action === "getWorkReportForm") return jsonOutput_(getWorkReportForm_(user, payload));
    if (action === "submitReport") return jsonOutput_(submitReport_(user, payload));
    if (action === "getMyWorkReportSummary") {
      const summary = getMyWorkReportSummary_(user, payload);
      const actionMs = Number(summary.serverTiming && summary.serverTiming.totalMs) || 0;
      summary.serverTiming = {
        authMs: authenticatedAt - requestStartedAt,
        summaryMs: actionMs,
        totalMs: Date.now() - requestStartedAt
      };
      return jsonOutput_(summary);
    }
    if (action === "getWorkReportAdminData") return jsonOutput_(getWorkReportAdminData_(user, payload));
    if (action === "setupWorkReportData") return jsonOutput_(setupWorkReportData_(user));
    if (action === "saveWorkReportItem") return jsonOutput_(saveWorkReportItem_(user, payload));
    if (action === "saveWorkReportCaseMapping") return jsonOutput_(saveWorkReportCaseMapping_(user, payload));
    if (action === "returnWorkReport") return jsonOutput_(returnWorkReport_(user, payload));
    if (action === "exportWorkReportsCsv") return jsonOutput_(exportWorkReportsCsv_(user, payload));
    if (action === "markNotificationRead") return jsonOutput_(withDashboardReferenceInvalidation_(user, () => markNotificationRead_(user, payload)));
    if (action === "getAdminDashboard") return jsonOutput_(getAdminDashboard_(user, body.idToken));
    if (action === "reviewRequest") return jsonOutput_(withAllDashboardReferenceInvalidation_(() => reviewRequest_(user, payload, body.idToken)));
    if (action === "updateEndWarningTime") return jsonOutput_(withAllDashboardReferenceInvalidation_(() => updateEndWarningTime_(user, payload)));
    throw apiError_("UNKNOWN_ACTION", "未対応の操作です。");
  } catch (error) {
    return jsonOutput_({ ok: false, code: error.code || "SERVER_ERROR", message: error.message || String(error) });
  }
}

function getPortalBootstrap_(user, payload) {
  const startedAt = Date.now();
  // 同一リクエスト内で大きいシートを二重に全件読込しない。
  // このスナップショットは応答処理中だけ使い、共有キャッシュへは保存しない。
  const sourceRows = {
    schedules: rows_(SHEETS.schedules),
    records: rows_(SHEETS.records)
  };
  const dashboard = getDashboardData_(user, sourceRows.schedules, payload && payload.scheduleId, sourceRows);
  const dashboardCompletedAt = Date.now();
  let workReportSummary = null;
  let workReportSummaryError = null;
  try {
    workReportSummary = getMyWorkReportSummary_(user, payload || {}, sourceRows);
  } catch (error) {
    // 成績集計だけが失敗しても、打刻に必要なダッシュボードは利用可能にする。
    workReportSummaryError = { code: error.code || "SERVER_ERROR", message: error.message || String(error) };
  }
  const completedAt = Date.now();
  return Object.assign({}, dashboard, {
    workReportSummary,
    workReportSummaryError,
    serverTiming: {
      dashboardMs: dashboardCompletedAt - startedAt,
      workReportSummaryMs: completedAt - dashboardCompletedAt,
      totalMs: completedAt - startedAt
    }
  });
}

function resolveUser_(idToken, options) {
  if (!idToken) throw apiError_("AUTH_REQUIRED", "ログイン情報がありません。");
  const cache = options && options.allowReadCache ? dashboardScheduleSyncCache_() : null;
  const cacheKey = cache ? dashboardReadAuthCacheKey_(idToken) : "";
  if (cache) {
    try {
      const cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error) {}
  }
  const response = UrlFetchApp.fetch(LOGIN_PROXY_URL, {
    method: "post",
    contentType: "text/plain;charset=utf-8",
    payload: JSON.stringify({ action: "resolveCurrentUserByIdToken", idToken: idToken }),
    muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText() || "{}");
  if (!data.ok || !data.user || !data.user.email) throw apiError_("AUTH_INVALID", "ログイン情報を確認できませんでした。");
  if (cache) {
    try { cache.put(cacheKey, JSON.stringify(data.user), DASHBOARD_READ_AUTH_CACHE_TTL_SECONDS); } catch (error) {}
  }
  return data.user;
}

function dashboardReadAuthCacheKey_(idToken) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(idToken), Utilities.Charset.UTF_8);
  return `attendance-dashboard-auth:v1:${Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "")}`;
}

function getDashboardData_(user, sourceSchedules, selectedScheduleId, sourceRows) {
  const sources = sourceRows || {};
  const referenceStartedAt = Date.now();
  const referenceResult = dashboardReferenceData_(user, sourceSchedules || sources.schedules);
  const referenceCompletedAt = Date.now();
  const reference = referenceResult.data;
  const today = today_();
  const schedules = reference.schedules;
  const todaySchedules = schedules.filter(r => dateKey_(r["勤務日"]) === today);
  const upcoming = schedules.filter(r => dateKey_(r["勤務日"]) >= today).sort((a, b) => dateKey_(a["勤務日"]).localeCompare(dateKey_(b["勤務日"]))).slice(0, 5);
  const recordsStartedAt = Date.now();
  const recordsResult = dashboardRecordData_(user, sources.records);
  const userRecords = recordsResult.data;
  const recordsCompletedAt = Date.now();
  const fieldReports = reference.fieldReports;
  const activeRecord = userRecords.find(r => r["実開始"] && !r["実終了"]);
  const pendingOvernightReport = findPendingOvernightReport_(user, today, fieldReports);
  const carriedRecord = activeRecord;
  const records = userRecords.filter(r => dateKey_(r["勤務日"]) === today);
  const requestedSchedule = todaySchedules.find(r => String(r.schedule_id || "") === String(selectedScheduleId || ""));
  const selectedSchedule = carriedRecord
    ? schedules.find(r => carriedRecord.schedule_id && String(r.schedule_id || "") === String(carriedRecord.schedule_id)) || schedules.find(r => dateKey_(r["勤務日"]) === dateKey_(carriedRecord["勤務日"]) && String(r["開発予定ID"] || "") === String(carriedRecord["開発予定ID"] || "")) || todaySchedules[0]
    : requestedSchedule || (pendingOvernightReport ? findScheduleById_(user, pendingOvernightReport.schedule_id, null, schedules) : null) || todaySchedules[0];
  const selectedWorkDate = selectedSchedule ? dateKey_(selectedSchedule["勤務日"]) : today;
  const selectedRecord = carriedRecord || (selectedSchedule ? userRecords.find(record => dateKey_(record["勤務日"]) === selectedWorkDate && (!selectedSchedule.schedule_id || String(record.schedule_id || "") === String(selectedSchedule.schedule_id))) : records[0]) || null;
  const result = {
    ok: true,
    serverNow: nowIso_(),
    today,
    settings: reference.settings,
    user: publicUser_(user),
    schedule: selectedSchedule || null,
    schedules: todaySchedules,
    upcoming,
    record: selectedRecord,
    fieldReports: fieldReportsFor_(user, selectedWorkDate, selectedSchedule ? scheduleReportKey_(selectedSchedule) : "", selectedSchedule ? selectedSchedule["開発予定ID"] : "", fieldReports, schedules),
    timing: selectedSchedule ? safeTimingStatus_(selectedSchedule, new Date()) : null,
    notifications: reference.notifications,
    adminAccess: isAdmin_(user) || reference.approvalReviewAccess,
    preciseLocationAccess: canViewPreciseLocation_(user)
  };
  result._serverTiming = {
    referenceMs: referenceCompletedAt - referenceStartedAt,
    recordsMs: recordsCompletedAt - recordsStartedAt,
    recordsCache: recordsResult.cacheStatus,
    assembleMs: Date.now() - recordsCompletedAt,
    referenceCache: referenceResult.cacheStatus
  };
  return result;
}

function dashboardReferenceData_(user, sourceSchedules) {
  const cache = dashboardScheduleSyncCache_();
  const key = dashboardReferenceCacheKey_(user, cache);
  if (!sourceSchedules && cache) {
    try {
      const cached = cache.get(key);
      if (cached) return { data: dashboardCacheDecode_(JSON.parse(cached)), cacheStatus: "hit" };
    } catch (error) {}
  }

  const data = {
    schedules: (sourceSchedules || rows_(SHEETS.schedules)).filter(row => matchesUser_(row, user)),
    fieldReports: rows_(SHEETS.fieldReports).filter(row => normalizeEmail_(row["報告者メール"]) === normalizeEmail_(user.email)),
    notifications: rows_(SHEETS.notifications).filter(row => normalizeEmail_(row["宛先メール"]) === normalizeEmail_(user.email)).sort((a, b) => String(b["作成日時"]).localeCompare(String(a["作成日時"]))).slice(0, 20),
    settings: settings_(),
    approvalReviewAccess: isAdmin_(user) ? false : hasApprovalReviewAccess_(user)
  };
  if (cache) {
    try { cache.put(key, JSON.stringify(dashboardCacheEncode_(data)), DASHBOARD_REFERENCE_CACHE_TTL_SECONDS); } catch (error) {}
  }
  return { data, cacheStatus: cache ? "miss" : "disabled" };
}

function dashboardReferenceCacheKey_(user, sourceCache) {
  const cache = sourceCache || dashboardScheduleSyncCache_();
  let generation = "0";
  if (cache) {
    try { generation = cache.get(dashboardReferenceGenerationKey_()) || "0"; } catch (error) {}
  }
  return `attendance-dashboard-reference:v1:${attendanceRuntimeEnvironment_()}:${generation}:${dashboardCacheIdentity_(user && user.email)}`;
}
function dashboardRecordData_(user, sourceRecords) {
  if (sourceRecords) return { data: sourceRecords.filter(row => normalizeEmail_(row.email) === normalizeEmail_(user.email)), cacheStatus: "bypass" };
  const cache = dashboardScheduleSyncCache_();
  const key = dashboardRecordCacheKey_(user, cache);
  if (cache) {
    try {
      const cached = cache.get(key);
      if (cached) return { data: dashboardCacheDecode_(JSON.parse(cached)), cacheStatus: "hit" };
    } catch (error) {}
  }
  const data = rows_(SHEETS.records).filter(row => normalizeEmail_(row.email) === normalizeEmail_(user.email));
  if (cache) {
    try { cache.put(key, JSON.stringify(dashboardCacheEncode_(data)), DASHBOARD_RECORD_CACHE_TTL_SECONDS); } catch (error) {}
  }
  return { data, cacheStatus: cache ? "miss" : "disabled" };
}
function dashboardRecordCacheKey_(user, sourceCache) {
  const cache = sourceCache || dashboardScheduleSyncCache_();
  let generation = "0";
  if (cache) {
    try { generation = cache.get(dashboardReferenceGenerationKey_()) || "0"; } catch (error) {}
  }
  return `attendance-dashboard-records:v1:${attendanceRuntimeEnvironment_()}:${generation}:${dashboardCacheIdentity_(user && user.email)}`;
}
function dashboardReferenceGenerationKey_() { return `attendance-dashboard-reference-generation:${attendanceRuntimeEnvironment_()}`; }
function dashboardCacheIdentity_(value) {
  const input = normalizeEmail_(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function dashboardCacheEncode_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") return { __shiftcoreDate: value.getTime() };
  if (Array.isArray(value)) return value.map(dashboardCacheEncode_);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).reduce((result, key) => (result[key] = dashboardCacheEncode_(value[key]), result), {});
}
function dashboardCacheDecode_(value) {
  if (Array.isArray(value)) return value.map(dashboardCacheDecode_);
  if (!value || typeof value !== "object") return value;
  if (Object.keys(value).length === 1 && Number.isFinite(Number(value.__shiftcoreDate))) return new Date(Number(value.__shiftcoreDate));
  return Object.keys(value).reduce((result, key) => (result[key] = dashboardCacheDecode_(value[key]), result), {});
}
function invalidateDashboardReferenceCache_(user) {
  const cache = dashboardScheduleSyncCache_();
  if (!cache) return;
  try {
    cache.remove(dashboardReferenceCacheKey_(user, cache));
    cache.remove(dashboardRecordCacheKey_(user, cache));
  } catch (error) {}
}
function invalidateAllDashboardReferenceCache_() {
  const cache = dashboardScheduleSyncCache_();
  if (!cache) return;
  try { cache.put(dashboardReferenceGenerationKey_(), String(Date.now()), DASHBOARD_REFERENCE_CACHE_VERSION_SECONDS); } catch (error) {}
}
function withDashboardReferenceInvalidation_(user, action) {
  try { return action(); } finally { invalidateDashboardReferenceCache_(user); }
}
function withAllDashboardReferenceInvalidation_(action) {
  try { return action(); } finally { invalidateAllDashboardReferenceCache_(); }
}

function submitFieldReport_(user, payload, idToken) {
  const reportType = String(payload.reportType || "");
  if (reportType !== "出発") throw apiError_("FIELD_REPORT_TYPE_INVALID", "出発以外は専用の報告操作を使用してください。");
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    ensureFieldReportSheet_();
    ensureFieldReportContractHeaders_();
    const today = today_();
    const schedule = findSchedule_(user, today, payload.scheduleId, idToken);
    if (!schedule) throw apiError_("FIELD_REPORT_SCHEDULE_REQUIRED", "本日の稼働予定を確認できません。");
    const scheduleKey = scheduleReportKey_(schedule);
    if (!scheduleKey) throw apiError_("FIELD_REPORT_SCHEDULE_ID_REQUIRED", "稼働予定の識別子を確認できません。");
    const reports = fieldReportsFor_(user, today, scheduleKey, schedule["開発予定ID"]);
    const existing = reports.find(report => String(report["報告種別"]) === reportType);
    if (existing) return { ok: true, duplicate: true, report: existing };
    const now = new Date();
    const fieldReportId = Utilities.getUuid();
    const locationPayload = validateDepartureLocation_(payload.location);
    const location = saveLocation_(user, fieldReportId, locationPayload, `出発: ${schedule["稼働場所"] || ""}`);
    appendObject_(SHEETS.fieldReports, { field_report_id: fieldReportId, "勤務日": today, "開発予定ID": schedule["開発予定ID"] || "", "報告種別": reportType, "報告者メール": user.email, "報告者氏名": user.name || "", "報告日時": now, schedule_id: schedule.schedule_id || "" });
    notifyManagers_(user, `${reportType}報告`, `${user.name || user.email}さんが${formatJst_(now)}に${reportType}を報告しました。`);
    return { ok: true, report: fieldReportsFor_(user, today, scheduleKey, schedule["開発予定ID"]).find(report => String(report["報告種別"]) === reportType) || null, locationStatus: location.status };
  } finally {
    lock.releaseLock();
  }
}

function arrive_(user, payload, idToken) {
  const now = new Date();
  const today = today_();
  const schedule = findScheduleById_(user, payload.scheduleId, idToken);
  if (!schedule) throw apiError_("FIELD_REPORT_SCHEDULE_REQUIRED", "対象の稼働予定を確認できません。");
  const workDate = dateKey_(schedule["勤務日"]);
  const scheduleKey = scheduleReportKey_(schedule);
  const previousReports = fieldReportsFor_(user, workDate, scheduleKey, schedule["開発予定ID"]);
  const previousRecord = findRecord_(user.email, workDate, schedule.schedule_id);
  const previousArrival = previousReports.find(report => String(report["報告種別"]) === "入店");
  if (previousArrival && previousRecord && previousRecord["実開始"]) {
    return { ok: true, duplicate: true, report: previousArrival, record: previousRecord, approvalRequired: hasPendingApproval_(previousRecord.record_id, "入店遅延報告"), requestId: findApprovalRequestId_(previousRecord.record_id, "入店遅延報告") };
  }
  const timing = buildTimingStatus_(schedule, now);
  if (timing.arrivalApprovalRequired && !String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "予定開始以降の入店理由を入力してください。");
  const approval = timing.arrivalApprovalRequired ? accountApprovalRequest_({ phase: "prepare", idToken: idToken }) : null;
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    ensureFieldReportSheet_();
    ensureFieldReportContractHeaders_();
    const reports = fieldReportsFor_(user, workDate, scheduleKey, schedule["開発予定ID"]);
    if (!reports.some(report => String(report["報告種別"]) === "出発")) throw apiError_("DEPARTURE_REPORT_REQUIRED", "先に出発報告を行ってください。");
    assertNoOtherActiveSchedule_(user.email, schedule.schedule_id);
    const existingRecord = findRecord_(user.email, workDate, schedule.schedule_id);
    const existingArrival = reports.find(report => String(report["報告種別"]) === "入店");
    let record = existingRecord;
    if (!record || !record["実開始"]) record = createClockInRecord_(user, schedule, payload, now, timing.arrivalApprovalRequired ? "入店承認待ち" : "稼働中");
    if (!existingArrival) appendObject_(SHEETS.fieldReports, { field_report_id: Utilities.getUuid(), "勤務日": workDate, "開発予定ID": schedule["開発予定ID"] || "", "報告種別": "入店", "報告者メール": user.email, "報告者氏名": user.name || "", "報告日時": now, schedule_id: schedule.schedule_id || "" });
    let requestId = "";
    if (timing.arrivalApprovalRequired) requestId = createApprovalRequestIfMissing_(user, approval, { recordId: record.record_id, type: "入店遅延報告", workDate: workDate, actualStart: now, reasonType: payload.reasonType || "その他", reason: payload.reason || "予定開始以降の入店" });
    return { ok: true, duplicate: Boolean(existingArrival && existingRecord && existingRecord["実開始"]), report: fieldReportsFor_(user, workDate, scheduleKey, schedule["開発予定ID"]).find(report => String(report["報告種別"]) === "入店") || null, record: findRecord_(user.email, workDate, schedule.schedule_id), approvalRequired: timing.arrivalApprovalRequired, requestId: requestId };
  } finally {
    lock.releaseLock();
  }
}

function createClockInRecord_(user, schedule, payload, now, status) {
  ensureRecordContractHeaders_();
  const recordId = Utilities.getUuid();
  const location = saveLocation_(user, recordId, payload.location || {}, schedule && schedule["稼働場所"]);
  append_(SHEETS.records, [recordId, user.organization_id || "", user.employee_code || "", user.email, user.name || "", dateKey_(schedule["勤務日"]), schedule["予定開始"] || "", schedule["予定終了"] || "", schedule["稼働場所"] || "", schedule["開発予定ID"] || "", user.employment_type || user.contract_type || "", status, now, now, payload.reason || "", "", "", false, location.status, location.id || "", "", "", now, now]);
  updateById_(SHEETS.records, "record_id", recordId, { schedule_id: schedule.schedule_id || "" });
  return findRecord_(user.email, dateKey_(schedule["勤務日"]), schedule.schedule_id);
}

function clockIn_(user, payload, idToken) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const settings = settings_();
    const now = new Date();
    const today = today_();
    const activeRecords = findActiveRecords_(user.email);
    if (activeRecords.length === 1 && dateKey_(activeRecords[0]["勤務日"]) === today && !activeRecords[0].schedule_id && payload.unplanned) return { ok: true, duplicate: true, record: activeRecords[0] };
    if (activeRecords.length) throw apiError_("OTHER_SCHEDULE_ACTIVE", "終了していない稼働記録があります。先に終了報告を行ってください。");
    const existing = findRecord_(user.email, today);
    if (existing && existing["実開始"]) return { ok: true, duplicate: true, record: existing };
    const current = timeKey_(now);
    if (current >= settings.start_limit_time) throw apiError_("CORRECTION_REQUIRED", "10:00以降の開始は修正申請が必要です。");
    if (current >= settings.start_warning_time && !String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "9:30以降は未押下理由を入力してください。");

    const schedules = getSchedules_(idToken).filter(r => matchesUser_(r, user) && dateKey_(r["勤務日"]) === today);
    if (schedules.length) throw apiError_("DEPARTURE_REPORT_REQUIRED", "予定のある勤務は出発報告後に入店してください。");
    if (!payload.unplanned) throw apiError_("UNPLANNED_REQUIRED", "本日の予定がないため、予定外稼働として理由を入力してください。");
    if (!String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "予定外稼働の理由を入力してください。");

    const recordId = Utilities.getUuid();
    const location = saveLocation_(user, recordId, payload.location || {}, payload.workLocation || "");
    const row = [
      recordId, user.organization_id || "", user.employee_code || "", user.email, user.name || "", today,
      "", "", payload.workLocation || "",
      payload.planId || "", user.employment_type || user.contract_type || "", current >= settings.start_warning_time ? "開始遅延" : "稼働中",
      now, now, payload.reason || "", "", "", true, location.status, location.id || "", "", "", now, now
    ];
    append_(SHEETS.records, row);
    notifyManagers_(user, current >= settings.start_warning_time ? "開始遅延" : "予定外稼働", `${user.name || user.email}さんが${formatJst_(now)}に稼働を開始しました。${payload.reason ? " 理由: " + payload.reason : ""}`);
    return { ok: true, record: findRecord_(user.email, today) };
  } finally {
    lock.releaseLock();
  }
}

function clockOut_(user, payload, idToken) {
  const now = new Date();
  const requestedScheduleId = String(payload.scheduleId || "");
  const recordBeforeLock = selectClockOutRecord_(user.email, requestedScheduleId);
  if (!recordBeforeLock || !recordBeforeLock["実開始"]) throw apiError_("NOT_STARTED", "入店記録がありません。");
  if (requestedScheduleId && String(recordBeforeLock.schedule_id || "") !== requestedScheduleId) throw apiError_("SCHEDULE_RECORD_MISMATCH", "選択した予定の入店記録を確認できません。");
  const workDate = dateKey_(recordBeforeLock["勤務日"]);
  if (recordBeforeLock["実終了"]) return { ok: true, duplicate: true, record: recordBeforeLock, plans: findPlansForDate_(user, idToken, workDate), approvalRequired: hasPendingApproval_(recordBeforeLock.record_id, "日付またぎ終了報告"), requestId: findApprovalRequestId_(recordBeforeLock.record_id, "日付またぎ終了報告"), workReportRequired: workReportRequiredForRecord_(recordBeforeLock) };
  const schedule = findSchedule_(user, workDate, payload.scheduleId || "", idToken);
  const timing = schedule ? buildTimingStatus_(schedule, now) : { endApprovalRequired: dateKey_(now) > workDate, endWarning: false };
  if (timing.endApprovalRequired && !String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "0:00以降の終了理由を入力してください。");
  const approval = timing.endApprovalRequired ? accountApprovalRequest_({ phase: "prepare", idToken: idToken }) : null;
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const record = selectClockOutRecord_(user.email, requestedScheduleId);
    if (!record || !record["実開始"]) throw apiError_("NOT_STARTED", "入店記録がありません。");
    if (requestedScheduleId && String(record.schedule_id || "") !== requestedScheduleId) throw apiError_("SCHEDULE_RECORD_MISMATCH", "選択した予定の入店記録を確認できません。");
    if (record["実終了"]) return { ok: true, duplicate: true, record, plans: findPlansForDate_(user, idToken, workDate), approvalRequired: hasPendingApproval_(record.record_id, "日付またぎ終了報告"), workReportRequired: workReportRequiredForRecord_(record) };
    updateById_(SHEETS.records, "record_id", record.record_id, { "状態": timing.endApprovalRequired ? "終了承認待ち" : "終了済み", "実終了": now, "終了押下": now, "更新日時": now });
    let requestId = "";
    if (timing.endApprovalRequired) requestId = createApprovalRequestIfMissing_(user, approval, { recordId: record.record_id, type: "日付またぎ終了報告", workDate: workDate, actualEnd: now, reasonType: payload.reasonType || "その他", reason: payload.reason || "0:00以降の終了報告" });
    const completedRecord = findRecord_(user.email, workDate, record.schedule_id || "");
    return { ok: true, record: completedRecord, plans: findPlansForDate_(user, idToken, workDate), approvalRequired: timing.endApprovalRequired, requestId: requestId, workReportRequired: workReportRequiredForRecord_(completedRecord) };
  } finally {
    lock.releaseLock();
  }
}

function createApprovalRequestIfMissing_(user, approval, payload) {
  ensureRequestContractHeaders_();
  const existing = rows_(SHEETS.requests).find(r => String(r.record_id || "") === String(payload.recordId || "") && String(r["種別"] || "") === String(payload.type || "") && ["申請中", "承認済み"].includes(String(r["状態"] || "")));
  if (existing) return String(existing.request_id || "");
  const requestId = Utilities.getUuid();
  appendObject_(SHEETS.requests, { request_id: requestId, record_id: payload.recordId || "", "種別": payload.type, "申請者メール": user.email, "申請者氏名": user.name || "", "実勤務日": payload.workDate, "申請開始": payload.actualStart || "", "申請終了": payload.actualEnd || "", "理由区分": payload.reasonType || "その他", "理由詳細": payload.reason || "", "状態": "申請中", "申請日時": new Date(), applicant_internal_user_id: approval.applicant_internal_user_id, request_version: 1, approval_reviewer_internal_user_id: approval.approval_reviewer_internal_user_id, applicant_organization_version: approval.applicant_organization_version });
  invalidateAllDashboardReferenceCache_();
  return requestId;
}

function submitCorrection_(user, payload, idToken) {
  const approval = accountApprovalRequest_({ phase: "prepare", idToken: idToken });
  const requestId = Utilities.getUuid();
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    ensureRequestContractHeaders_();
    appendObject_(SHEETS.requests, {
      request_id: requestId, record_id: payload.recordId || "", "種別": payload.type || "打刻修正",
      "申請者メール": user.email, "申請者氏名": user.name || "", "実勤務日": payload.workDate || today_(),
      "申請開始": payload.actualStart || "", "申請終了": payload.actualEnd || "", "理由区分": payload.reasonType || "その他",
      "理由詳細": payload.reason || "", "状態": "申請中", "申請日時": new Date(),
      applicant_internal_user_id: approval.applicant_internal_user_id, request_version: 1,
      approval_reviewer_internal_user_id: approval.approval_reviewer_internal_user_id,
      applicant_organization_version: approval.applicant_organization_version
    });
  } finally {
    lock.releaseLock();
  }
  notifyManagers_(user, "修正申請", `${user.name || user.email}さんから${payload.type || "打刻修正"}の申請が届きました。`);
  return { ok: true, requestId };
}

function getWorkReportForm_(user, payload) {
  const record = assertReportableRecord_(user, payload.recordId);
  assertWorkReportSchema_();
  const context = workReportContext_(record);
  const existing = findWorkReportByRecordId_(record.record_id);
  const template = existing ? workReportTemplateForExistingReport_(existing, context) : assertWorkReportTarget_(context);
  const reportAnswers = existing ? rows_(SHEETS.reportAnswers) : [];
  const reportRevisions = existing ? rows_(SHEETS.reportRevisions) : [];
  const currentAnswers = existing ? currentWorkReportAnswers_(existing, reportAnswers) : [];
  const pendingRevision = existing ? pendingWorkReportRevision_(existing, reportRevisions) : null;
  const pendingAnswers = pendingRevision ? reportAnswers.filter(answer => String(answer.revision_id || "") === String(pendingRevision.revision_id || "")) : [];
  const displayAnswers = mergeWorkReportDraftAnswers_(currentAnswers, pendingAnswers);
  const definitions = workReportDefinitionsFor_(template.templateId, currentAnswers);
  return {
    ok: true,
    submitted: Boolean(existing && isSubmittedWorkReport_(existing)),
    status: existing ? workReportStatus_(existing) : "未提出",
    editable: true,
    reportId: existing ? String(existing.report_id || "") : "",
    revisionNumber: existing ? Number(existing.current_revision_number) || 0 : 0,
    returnReason: existing ? String(existing["差戻し理由"] || "") : "",
    revisions: existing ? workReportRevisionHistory_(existing, reportRevisions, reportAnswers) : [],
    resuming: Boolean(pendingRevision),
    resumeSubmissionToken: pendingRevision ? String(pendingRevision.submission_token || "") : "",
    record: {
      recordId: String(record.record_id || ""),
      scheduleId: context.scheduleId,
      workDate: context.workDate,
      planId: context.planId,
      planName: context.planName,
      storeName: context.storeName,
      reporterName: user.name || record["氏名"] || ""
    },
    items: definitions.map(definition => {
      const item = publicWorkReportItem_(definition);
      const answer = displayAnswers.find(candidate => String(candidate.item_id || "") === item.itemId);
      item.inputState = answer ? String(answer["入力状態"] || "answered") : "";
      item.value = answer && item.inputState !== "defaulted" && item.inputState !== "blank" ? publicWorkReportAnswer_(answer).value : "";
      item.retired = !activeWorkReportItems_(template.templateId).some(active => String(active.item_id || "") === item.itemId);
      return item;
    })
  };
}

function submitReport_(user, payload) {
  if (!payload.recordId || !Array.isArray(payload.answers) || !String(payload.submissionToken || "").trim()) throw apiError_("REPORT_REQUIRED", "実績回答を確認できません。");
  assertReportableRecord_(user, payload.recordId);
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    assertWorkReportSchema_();
    const record = assertReportableRecord_(user, payload.recordId);
    const context = workReportContext_(record);
    let report = findWorkReportByRecordId_(record.record_id);
    const template = report ? workReportTemplateForExistingReport_(report, context) : assertWorkReportTarget_(context);
    const currentAnswers = report ? currentWorkReportAnswers_(report) : [];
    const definitions = workReportDefinitionsFor_(template.templateId, currentAnswers);
    const normalizedAnswers = normalizeWorkReportAnswers_(definitions, payload.answers);
    const definitionVersion = definitions.reduce((max, item) => Math.max(max, Number(item["定義版"]) || 1), 1);
    const reportId = report && report.report_id ? String(report.report_id) : Utilities.getUuid();
    const submissionToken = sheetText_(String(payload.submissionToken).trim()).slice(0, 200);
    const previousRevisionNumber = report ? Number(report.current_revision_number) || 0 : 0;
    const reportRevisions = rows_(SHEETS.reportRevisions);
    const existingRevision = reportRevisions.find(revision => String(revision.submission_token || "") === submissionToken);
    const pendingRevision = report ? pendingWorkReportRevision_(report, reportRevisions) : null;
    if (!existingRevision && pendingRevision) throw apiError_("REPORT_SUBMISSION_IN_PROGRESS", "前回の実績報告が保存途中です。画面を再読込して続きから送信してください。");
    if (existingRevision) {
      if (String(existingRevision.report_id || "") !== reportId) throw apiError_("REPORT_SUBMISSION_TOKEN_INVALID", "送信情報が別の実績報告と重複しています。画面を再読込してください。");
      const storedRevisionAnswers = rows_(SHEETS.reportAnswers).filter(answer => String(answer.revision_id || "") === String(existingRevision.revision_id || ""));
      assertStoredWorkReportAnswersMatch_(storedRevisionAnswers, normalizedAnswers);
      if (String(existingRevision["状態"] || "") === "提出済み") {
        const recoveredRevisionNumber = Number(existingRevision["改訂番号"]) || previousRevisionNumber;
        completeWorkReportHeader_(reportId, context, template.templateId, definitionVersion, String(existingRevision.revision_id || ""), recoveredRevisionNumber, user, record);
        return { ok: true, duplicate: true, reportId, revisionNumber: recoveredRevisionNumber };
      }
    }
    if (report && isSubmittedWorkReport_(report) && workReportAnswersEqual_(currentAnswers, normalizedAnswers)) {
      return { ok: true, duplicate: true, reportId, revisionNumber: previousRevisionNumber };
    }

    if (!report) {
      appendObject_(SHEETS.reports, {
        report_id: reportId,
        record_id: record.record_id,
        "開発予定ID": context.planId,
        "開発予定名": sheetText_(context.planName),
        "報告者メール": user.email,
        "報告者氏名": sheetText_(user.name || record["氏名"] || ""),
        "実績内容": "",
        "課題・申し送り": "",
        "報告日時": "",
        "勤務日": context.workDate,
        "店舗名": sheetText_(context.storeName),
        schedule_id: context.scheduleId,
        "保存状態": "保存中",
        "項目定義版": definitionVersion,
        template_id: template.templateId,
        current_revision_id: "",
        current_revision_number: 0,
        "差戻し理由": "",
        "差戻し日時": "",
        "差戻し者メール": ""
      });
      report = findWorkReportByRecordId_(record.record_id);
    }

    const revisionId = existingRevision ? String(existingRevision.revision_id || "") : Utilities.getUuid();
    const revisionNumber = existingRevision ? Number(existingRevision["改訂番号"]) || previousRevisionNumber + 1 : previousRevisionNumber + 1;
    if (!existingRevision) appendObject_(SHEETS.reportRevisions, {
      revision_id: revisionId,
      report_id: reportId,
      record_id: record.record_id,
      "改訂番号": revisionNumber,
      "状態": "保存中",
      "編集者メール": user.email,
      "編集者氏名": sheetText_(user.name || record["氏名"] || ""),
      "編集種別": previousRevisionNumber === 0 ? "初回提出" : workReportStatus_(report) === "差戻し中" ? "差戻し後再提出" : "本人修正",
      submission_token: submissionToken,
      "作成日時": new Date(),
      "提出日時": ""
    });
    const existingItemIds = rows_(SHEETS.reportAnswers)
      .filter(answer => String(answer.revision_id || "") === revisionId)
      .map(answer => String(answer.item_id || ""));
    const answerRows = normalizedAnswers.filter(answer => !existingItemIds.includes(String(answer.item.item_id || ""))).map(answer => ({
      answer_id: Utilities.getUuid(),
      report_id: reportId,
      revision_id: revisionId,
      record_id: record.record_id,
      item_id: answer.item.item_id,
      "定義版": Number(answer.item["定義版"]) || 1,
      "項目名": sheetText_(answer.item["項目名"]),
      "種別": answer.item["種別"],
      "カテゴリID": answer.item["カテゴリID"],
      "カテゴリ名": sheetText_(answer.item["カテゴリ名"]),
      "表示順": Number(answer.item["表示順"]) || 0,
      "数値回答": answer.type === "number" ? answer.value : "",
      "文章回答": answer.type === "text" ? sheetText_(answer.value) : "",
      "入力状態": answer.inputState,
      "作成日時": new Date()
    }));
    appendObjects_(SHEETS.reportAnswers, answerRows);

    updateById_(SHEETS.reportRevisions, "revision_id", revisionId, { "状態": "提出済み", "提出日時": new Date() });
    completeWorkReportHeader_(reportId, context, template.templateId, definitionVersion, revisionId, revisionNumber, user, record);
    return { ok: true, reportId: reportId, revisionNumber };
  } finally {
    lock.releaseLock();
  }
}

function completeWorkReportHeader_(reportId, context, templateId, definitionVersion, revisionId, revisionNumber, user, record) {
  updateById_(SHEETS.reports, "report_id", reportId, {
      "開発予定ID": context.planId,
      "開発予定名": sheetText_(context.planName),
      "報告者メール": user.email,
      "報告者氏名": sheetText_(user.name || record["氏名"] || ""),
      "報告日時": new Date(),
      "勤務日": context.workDate,
      "店舗名": sheetText_(context.storeName),
      schedule_id: context.scheduleId,
      "保存状態": "提出済み",
      "項目定義版": definitionVersion,
      template_id: templateId,
      current_revision_id: revisionId,
      current_revision_number: revisionNumber,
      "差戻し理由": "",
      "差戻し日時": "",
      "差戻し者メール": ""
  });
}

function getMyWorkReportSummary_(user, payload, sourceRows) {
  const startedAt = Date.now();
  const sources = sourceRows || {};
  const month = /^\d{4}-\d{2}$/.test(String(payload && payload.month || "")) ? String(payload.month) : today_().slice(0, 7);
  const dateFrom = `${month}-01`;
  const dateTo = monthEnd_(month);
  const schedules = sources.schedules || rows_(SHEETS.schedules);
  const templates = sources.reportTemplates || rows_(SHEETS.reportTemplates);
  const mappings = rows_(SHEETS.reportCaseMappings);
  const reports = rows_(SHEETS.reports);
  const reportAnswers = rows_(SHEETS.reportAnswers);
  const reportByRecord = reports.reduce((result, report) => (result[String(report.record_id || "")] = report, result), Object.create(null));
  const records = (sources.records || rows_(SHEETS.records)).filter(record => {
    const workDate = dateKey_(record["勤務日"]);
    if (normalizeEmail_(record.email) !== normalizeEmail_(user.email) || !Boolean(record["実終了"] || record["正式終了"]) || workDate < dateFrom || workDate > dateTo) return false;
    return Boolean(reportByRecord[String(record.record_id || "")] || workReportTemplateForContext_(workReportContext_(record, schedules), mappings, templates));
  });
  const submissions = records.map(record => {
    const context = workReportContext_(record, schedules);
    const report = reportByRecord[String(record.record_id || "")] || null;
    const storedTemplate = report && templates.find(template => String(template.template_id || "") === String(report.template_id || ""));
    return {
      recordId: String(record.record_id || ""),
      workDate: context.workDate,
      planName: context.planName,
      storeName: context.storeName,
      status: report ? workReportStatus_(report) : "未提出",
      revisionNumber: report ? Number(report.current_revision_number) || 0 : 0,
      returnReason: report ? String(report["差戻し理由"] || "") : "",
      editable: Boolean(storedTemplate || workReportTemplateForContext_(context, mappings, templates))
    };
  }).sort((a, b) => b.workDate.localeCompare(a.workDate));
  const metrics = Object.create(null);
  const targetRecordIds = submissions.map(item => item.recordId);
  const reportItems = (sources.reportItems || rows_(SHEETS.reportItems)).slice().sort(workReportItemSort_);
  const itemById = reportItems.reduce((result, item) => (result[String(item.item_id || "")] = item, result), Object.create(null));
  reports.filter(report => targetRecordIds.includes(String(report.record_id || "")) && normalizeEmail_(report["報告者メール"]) === normalizeEmail_(user.email) && isSubmittedWorkReport_(report)).forEach(report => {
    currentWorkReportAnswers_(report, reportAnswers).forEach(answer => {
      const master = itemById[String(answer.item_id || "")];
      if (!master || !booleanValue_(master["ダッシュボード表示"]) || String(answer["種別"] || "") !== "number") return;
      const key = [answer.item_id, answer["種別"], answer["項目名"], answer["カテゴリ名"]].join("\u001f");
      const currentMeaning = String(master["項目名"] || "") === String(answer["項目名"] || "") && String(master["カテゴリ名"] || "") === String(answer["カテゴリ名"] || "");
      if (!metrics[key]) metrics[key] = { itemId: String(answer.item_id || ""), label: currentMeaning ? String(master["ダッシュボード名"] || answer["項目名"] || "") : String(answer["項目名"] || ""), order: Number(master["ダッシュボード順"]) || Number(answer["表示順"]) || 0, value: 0 };
      metrics[key].value += Number(answer["数値回答"]) || 0;
    });
  });
  return {
    ok: true,
    ownerEmail: normalizeEmail_(user.email),
    month,
    counts: {
      total: submissions.length,
      submitted: submissions.filter(item => item.status === "提出済み").length,
      missing: submissions.filter(item => item.status === "未提出" || item.status === "保存未完了").length,
      returned: submissions.filter(item => item.status === "差戻し中").length
    },
    metrics: Object.keys(metrics).map(key => metrics[key]).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ja")),
    submissions,
    serverTiming: { totalMs: Date.now() - startedAt }
  };
}

function getWorkReportAdminData_(user, payload) {
  requireAdmin_(user);
  assertWorkReportSchema_();
  return buildWorkReportAdminData_(payload || {});
}

function setupWorkReportData_(user) {
  requireAdmin_(user);
  const result = ensureWorkReportSheetsWithLock_();
  return { ok: true, templateCount: result.templates.length, itemCount: result.items.length };
}

function buildWorkReportAdminData_(payload) {
  const filters = normalizeWorkReportFilters_(payload);
  const schedules = rows_(SHEETS.schedules);
  const reports = rows_(SHEETS.reports);
  const reportByRecord = reports.reduce((result, report) => {
    if (report.record_id && !result[String(report.record_id)]) result[String(report.record_id)] = report;
    return result;
  }, Object.create(null));
  const reportAnswers = rows_(SHEETS.reportAnswers);
  const revisions = rows_(SHEETS.reportRevisions);
  const notifications = rows_(SHEETS.notifications);
  const completedRecords = rows_(SHEETS.records).filter(record => {
    const workDate = dateKey_(record["勤務日"]);
    if (!Boolean(record["実終了"] || record["正式終了"]) || workDate < filters.dateFrom || workDate > filters.dateTo) return false;
    return Boolean(reportByRecord[String(record.record_id || "")] || workReportTemplateForContext_(workReportContext_(record, schedules)));
  });
  const submissionRows = completedRecords.map(record => {
    const context = workReportContext_(record, schedules);
    const report = reportByRecord[String(record.record_id || "")] || null;
    return {
      recordId: String(record.record_id || ""),
      reportId: report ? String(report.report_id || "") : "",
      workDate: context.workDate,
      scheduleId: context.scheduleId,
      planId: context.planId,
      planName: context.planName,
      storeName: context.storeName,
      reporterEmail: String(record.email || report && report["報告者メール"] || ""),
      reporterName: String(record["氏名"] || report && report["報告者氏名"] || record.email || ""),
      status: report ? workReportStatus_(report) : "未提出",
      revisionNumber: report ? Number(report.current_revision_number) || 0 : 0,
      returnReason: report ? String(report["差戻し理由"] || "") : "",
      reportedAt: report && report["報告日時"] ? displayDateTime_(report["報告日時"]) : ""
    };
  }).filter(row => matchesWorkReportFilters_(row, filters));
  const visibleReportIds = submissionRows.map(row => row.reportId).filter(Boolean);
  const reportDetails = reports.filter(report => visibleReportIds.includes(String(report.report_id || ""))).map(report => {
    const reportId = String(report.report_id || "");
    const currentAnswers = currentWorkReportAnswers_(report, reportAnswers);
    const reportRevisions = workReportRevisionHistory_(report, revisions, reportAnswers, notifications);
    return {
      reportId,
      legacy: !currentAnswers.length && !reportRevisions.length,
      result: String(report["実績内容"] || ""),
      notes: String(report["課題・申し送り"] || ""),
      answers: currentAnswers.sort(workReportItemSort_).map(publicWorkReportAnswer_),
      revisions: reportRevisions
    };
  });
  const aggregates = aggregateWorkReportAnswers_(submissionRows, reportDetails, filters.groupBy);
  return {
    ok: true,
    filters,
    counts: {
      total: submissionRows.length,
      submitted: submissionRows.filter(row => row.status === "提出済み").length,
      returned: submissionRows.filter(row => row.status === "差戻し中").length,
      missing: submissionRows.filter(row => row.status !== "提出済み").length
    },
    submissions: submissionRows,
    aggregates,
    reportDetails,
    items: allWorkReportItems_().map(publicWorkReportItem_),
    templates: activeWorkReportTemplates_().map(publicWorkReportTemplate_),
    caseMappings: workReportCaseCandidates_(schedules)
  };
}

function saveWorkReportItem_(user, payload) {
  requireAdmin_(user);
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    assertWorkReportSchema_();
    const reports = rows_(SHEETS.reports);
    const revisions = rows_(SHEETS.reportRevisions);
    if (reports.some(report => String(report["保存状態"] || "") === "保存中" || pendingWorkReportRevision_(report, revisions)) || revisions.some(revision => String(revision["状態"] || "") === "保存中")) throw apiError_("REPORT_SUBMISSION_IN_PROGRESS", "保存中の実績報告があります。完了または再送後に項目を変更してください。");
    const existing = payload.itemId ? rows_(SHEETS.reportItems).find(item => String(item.item_id || "") === String(payload.itemId)) : null;
    if (payload.itemId && !existing) throw apiError_("REPORT_ITEM_NOT_FOUND", "対象の実績項目が見つかりません。");
    const name = String(payload.name || "").trim();
    const type = String(payload.type || existing && existing["種別"] || "");
    const templateId = String(payload.templateId || existing && existing.template_id || DEFAULT_WORK_REPORT_TEMPLATE_ID);
    if (!activeWorkReportTemplates_().some(template => String(template.template_id || "") === templateId)) throw apiError_("REPORT_TEMPLATE_INVALID", "実績テンプレートを確認できません。");
    const categoryName = String(payload.categoryName || "").trim();
    if (!name || name.length > 100 || /^[=+\-@]/.test(name)) throw apiError_("REPORT_ITEM_NAME_INVALID", "項目名は1〜100文字で入力してください。先頭に数式記号は使用できません。");
    if (!["number", "text"].includes(type)) throw apiError_("REPORT_ITEM_TYPE_INVALID", "項目種別は数値または文章を指定してください。");
    if (!categoryName || categoryName.length > 60 || /^[=+\-@]/.test(categoryName)) throw apiError_("REPORT_ITEM_CATEGORY_INVALID", "カテゴリ名は1〜60文字で入力してください。先頭に数式記号は使用できません。");
    const displayOrder = Number(payload.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) throw apiError_("REPORT_ITEM_ORDER_INVALID", "表示順は0以上の整数で入力してください。");
    const sameCategory = rows_(SHEETS.reportItems).find(item => String(item["カテゴリ名"] || "") === categoryName);
    const itemId = existing ? String(existing.item_id) : `item_${Utilities.getUuid().replace(/-/g, "")}`;
    const categoryId = String(existing && String(existing["カテゴリ名"] || "") === categoryName && existing["カテゴリID"] || sameCategory && sameCategory["カテゴリID"] || `category_${Utilities.getUuid().replace(/-/g, "")}`);
    const now = new Date();
    const changes = {
      item_id: itemId,
      template_id: templateId,
      "項目名": name,
      "種別": type,
      "カテゴリID": categoryId,
      "カテゴリ名": categoryName,
      "表示順": displayOrder,
      "必須": payload.required == null && existing ? booleanValue_(existing["必須"]) : booleanValue_(payload.required),
      "有効": payload.active == null && existing ? booleanValue_(existing["有効"]) : booleanValue_(payload.active),
      "定義版": existing ? (Number(existing["定義版"]) || 1) + 1 : 1,
      "ダッシュボード表示": type === "number" && (payload.dashboardVisible == null && existing ? booleanValue_(existing["ダッシュボード表示"]) : booleanValue_(payload.dashboardVisible)),
      "ダッシュボード名": sheetText_(String(payload.dashboardName == null && existing ? existing["ダッシュボード名"] || "" : payload.dashboardName || "").trim().slice(0, 40)),
      "ダッシュボード順": normalizeDashboardOrder_(payload.dashboardOrder == null && existing ? existing["ダッシュボード順"] : payload.dashboardOrder),
      "作成日時": existing && existing["作成日時"] || now,
      "更新日時": now
    };
    if (existing) updateById_(SHEETS.reportItems, "item_id", itemId, changes);
    else appendObject_(SHEETS.reportItems, changes);
    return { ok: true, item: publicWorkReportItem_(changes) };
  } finally {
    lock.releaseLock();
  }
}

function saveWorkReportCaseMapping_(user, payload) {
  requireAdmin_(user);
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    assertWorkReportSchema_();
    const planId = String(payload.planId || "").trim();
    const planName = String(payload.planName || "").trim();
    const templateId = String(payload.templateId || DEFAULT_WORK_REPORT_TEMPLATE_ID);
    if (!planId || planId.length > 200 || /^[=+\-@]/.test(planId)) throw apiError_("REPORT_CASE_INVALID", "対象案件IDを確認してください。");
    if (!activeWorkReportTemplates_().some(template => String(template.template_id || "") === templateId)) throw apiError_("REPORT_TEMPLATE_INVALID", "実績テンプレートを確認できません。");
    const mappings = rows_(SHEETS.reportCaseMappings);
    const existing = latestWorkReportCaseMapping_(mappings.filter(mapping => String(mapping["開発予定ID"] || "") === planId));
    const requestedActive = booleanValue_(payload.active);
    const wasActive = Boolean(existing && booleanValue_(existing["有効"]));
    const now = new Date();
    const reactivating = Boolean(existing && requestedActive && !wasActive);
    const changes = {
      mapping_id: existing && !reactivating ? String(existing.mapping_id || "") : Utilities.getUuid(),
      "開発予定ID": planId,
      "開発予定名": sheetText_(planName.slice(0, 200)),
      template_id: templateId,
      "有効": requestedActive,
      "有効開始日時": requestedActive ? (reactivating ? now : existing && existing["有効開始日時"] || "") : existing && existing["有効開始日時"] || "",
      "有効終了日時": requestedActive ? "" : wasActive ? now : existing && (existing["有効終了日時"] || existing["更新日時"] || existing["作成日時"]) || "",
      "作成日時": existing && !reactivating ? existing["作成日時"] || now : now,
      "更新日時": now
    };
    if (existing && !reactivating) updateById_(SHEETS.reportCaseMappings, "mapping_id", changes.mapping_id, changes);
    else appendObject_(SHEETS.reportCaseMappings, changes);
    return { ok: true, mapping: publicWorkReportCaseMapping_(changes) };
  } finally {
    lock.releaseLock();
  }
}

function returnWorkReport_(user, payload) {
  requireAdmin_(user);
  const reason = String(payload.reason || "").trim();
  if (!reason || reason.length > 1000) throw apiError_("REPORT_RETURN_REASON_REQUIRED", "差戻し理由を1〜1000文字で入力してください。");
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    assertWorkReportSchema_();
    ensureReportRevisionReturnHeaders_();
    const report = rows_(SHEETS.reports).find(candidate => String(candidate.report_id || "") === String(payload.reportId || ""));
    if (!report || !isSubmittedWorkReport_(report)) throw apiError_("REPORT_RETURN_INVALID", "提出済みの実績報告を確認できません。");
    if (pendingWorkReportRevision_(report)) throw apiError_("REPORT_SUBMISSION_IN_PROGRESS", "本人の実績報告が保存途中です。再送完了後に差し戻してください。");
    const returnedAt = new Date();
    updateById_(SHEETS.reports, "report_id", report.report_id, {
      "保存状態": "差戻し中",
      "差戻し理由": sheetText_(reason),
      "差戻し日時": returnedAt,
      "差戻し者メール": user.email
    });
    if (report.current_revision_id) updateById_(SHEETS.reportRevisions, "revision_id", report.current_revision_id, {
      "差戻し理由": sheetText_(reason),
      "差戻し日時": returnedAt,
      "差戻し者メール": user.email
    });
    createNotification_(report["報告者メール"], report["報告者氏名"], "実績報告の差戻し", `実績報告が差し戻されました。理由: ${reason}`, report.report_id);
    return { ok: true, reportId: String(report.report_id || "") };
  } finally {
    lock.releaseLock();
  }
}

function exportWorkReportsCsv_(user, payload) {
  requireAdmin_(user);
  assertWorkReportSchema_();
  const data = buildWorkReportAdminData_(payload || {});
  const detailById = data.reportDetails.reduce((result, detail) => (result[detail.reportId] = detail, result), {});
  const includeHistory = booleanValue_(payload && payload.includeHistory);
  const headers = ["勤務日", "店舗名", "案件ID", "案件名", "報告者", "報告者メール", "提出状態", "報告日時", "改訂番号", "改訂種別", "改訂者", "改訂日時", "最新版", "項目ID", "定義版", "カテゴリ", "項目名", "種別", "数値回答", "文章回答", "入力状態", "旧実績内容", "旧課題・申し送り"];
  const rows = [];
  data.submissions.forEach(submission => {
    const detail = detailById[submission.reportId];
    const revisionRows = includeHistory && detail && detail.revisions.length ? detail.revisions : [{ revisionNumber: submission.revisionNumber || "", editType: "", editorName: "", submittedAt: submission.reportedAt, current: true, answers: detail && detail.answers || [] }];
    revisionRows.forEach(revision => {
      const answers = revision.answers && revision.answers.length ? revision.answers : [null];
      answers.forEach(answer => rows.push([
        submission.workDate, submission.storeName, submission.planId, submission.planName,
        submission.reporterName, submission.reporterEmail, submission.status, submission.reportedAt,
        revision.revisionNumber || "", revision.editType || "", revision.editorName || "", revision.submittedAt || "", revision.current ? "TRUE" : "FALSE",
        answer && answer.itemId || "", answer && answer.version || "", answer && answer.categoryName || "", answer && answer.name || "", answer && answer.type || "",
        answer && answer.type === "number" ? answer.value : "", answer && answer.type === "text" ? answer.value : "", answer && answer.inputState || "",
        detail && detail.legacy ? detail.result : "", detail && detail.legacy ? detail.notes : ""
      ]));
    });
  });
  const csv = [headers].concat(rows).map(row => row.map(csvCell_).join(",")).join("\r\n");
  return { ok: true, fileName: `work-reports${includeHistory ? "-history" : ""}_${data.filters.dateFrom}_${data.filters.dateTo}.csv`, csv: "\uFEFF" + csv };
}

function assertReportableRecord_(user, recordId) {
  const record = rows_(SHEETS.records).find(row => String(row.record_id || "") === String(recordId || ""));
  if (!record || normalizeEmail_(record.email) !== normalizeEmail_(user.email)) throw apiError_("REPORT_RECORD_FORBIDDEN", "本人の稼働記録を確認できません。");
  if (!record["実終了"] && !record["正式終了"]) throw apiError_("REPORT_CLOCK_OUT_REQUIRED", "稼働終了後に実績報告を送信してください。");
  return record;
}

function assertWorkReportTarget_(context) {
  const template = workReportTemplateForContext_(context);
  if (!template) throw apiError_("REPORT_NOT_REQUIRED", "この案件は現在の実績報告対象ではありません。");
  return template;
}
function workReportTemplateForExistingReport_(report, context) {
  const templateId = String(report && report.template_id || "");
  const storedTemplate = templateId ? rows_(SHEETS.reportTemplates).find(template => String(template.template_id || "") === templateId) : null;
  if (storedTemplate) return publicWorkReportTemplate_(storedTemplate);
  return assertWorkReportTarget_(context);
}
function workReportRequiredForRecord_(record) { return Boolean(record && workReportTemplateForContext_(workReportContext_(record))); }

function workReportContext_(record, sourceSchedules) {
  const schedules = sourceSchedules || rows_(SHEETS.schedules);
  const exact = record.schedule_id ? schedules.find(schedule => String(schedule.schedule_id || "") === String(record.schedule_id) && scheduleMatchesReportRecord_(schedule, record)) : null;
  const legacyMatches = exact ? [] : schedules.filter(schedule => normalizeEmail_(schedule.email) === normalizeEmail_(record.email) && dateKey_(schedule["勤務日"]) === dateKey_(record["勤務日"]) && String(schedule["開発予定ID"] || "") === String(record["開発予定ID"] || ""));
  const schedule = exact || (legacyMatches.length === 1 ? legacyMatches[0] : null);
  const planId = String(record["開発予定ID"] || schedule && schedule["開発予定ID"] || "");
  const storeName = String(schedule && schedule["稼働場所"] || record["予定場所"] || "");
  return {
    workDate: dateKey_(record["勤務日"]),
    completedAt: record["実終了"] || record["正式終了"] || "",
    scheduleId: String(record.schedule_id || schedule && schedule.schedule_id || ""),
    planId,
    planName: String(schedule && schedule["開発予定名"] || storeName || planId || "予定外稼働"),
    storeName
  };
}
function scheduleMatchesReportRecord_(schedule, record) { const emailMatch = schedule.email && record.email && normalizeEmail_(schedule.email) === normalizeEmail_(record.email); const employeeMatch = schedule.employee_code && record.employee_code && String(schedule.employee_code) === String(record.employee_code); return Boolean(emailMatch || employeeMatch); }

function findWorkReportByRecordId_(recordId) { return rows_(SHEETS.reports).find(report => String(report.record_id || "") === String(recordId || "")) || null; }
function isSubmittedWorkReport_(report) { return Boolean(report) && workReportStatus_(report) === "提出済み"; }
function workReportStatus_(report) { const status = String(report && report["保存状態"] || ""); if (status === "差戻し中") return "差戻し中"; if (["保存中", "保存失敗"].includes(status)) return "保存未完了"; return report ? "提出済み" : "未提出"; }
function allWorkReportItems_() { return rows_(SHEETS.reportItems).sort(workReportItemSort_); }
function activeWorkReportItems_(templateId) { return allWorkReportItems_().filter(item => booleanValue_(item["有効"]) && (!templateId || String(item.template_id || DEFAULT_WORK_REPORT_TEMPLATE_ID) === String(templateId))); }
function workReportItemSort_(a, b) { return (Number(a["表示順"] || a.displayOrder) || 0) - (Number(b["表示順"] || b.displayOrder) || 0); }
function publicWorkReportItem_(item) { return { itemId: String(item.item_id || ""), templateId: String(item.template_id || DEFAULT_WORK_REPORT_TEMPLATE_ID), name: String(item["項目名"] || ""), type: String(item["種別"] || ""), categoryId: String(item["カテゴリID"] || ""), categoryName: String(item["カテゴリ名"] || ""), displayOrder: Number(item["表示順"]) || 0, required: booleanValue_(item["必須"]), active: booleanValue_(item["有効"]), version: Number(item["定義版"]) || 1, dashboardVisible: booleanValue_(item["ダッシュボード表示"]), dashboardName: String(item["ダッシュボード名"] || item["項目名"] || ""), dashboardOrder: Number(item["ダッシュボード順"]) || 0 }; }
function publicWorkReportAnswer_(answer) { const type = String(answer["種別"] || ""); return { itemId: String(answer.item_id || ""), name: String(answer["項目名"] || ""), type, categoryId: String(answer["カテゴリID"] || ""), categoryName: String(answer["カテゴリ名"] || ""), displayOrder: Number(answer["表示順"]) || 0, version: Number(answer["定義版"]) || 1, value: type === "number" ? Number(answer["数値回答"]) || 0 : String(answer["文章回答"] || ""), inputState: String(answer["入力状態"] || "answered") }; }
function workReportRevisionHistory_(report, sourceRevisions, sourceAnswers, sourceNotifications) {
  const reportId = String(report && report.report_id || "");
  if (!reportId) return [];
  const answers = sourceAnswers || rows_(SHEETS.reportAnswers);
  const revisions = (sourceRevisions || rows_(SHEETS.reportRevisions))
    .filter(revision => String(revision.report_id || "") === reportId && String(revision["状態"] || "") === "提出済み")
    .sort((a, b) => Number(a["改訂番号"] || 0) - Number(b["改訂番号"] || 0));
  const notifications = (sourceNotifications || rows_(SHEETS.notifications))
    .filter(notification => String(notification["対象ID"] || "") === reportId && String(notification["種別"] || "") === "実績報告の差戻し")
    .sort((a, b) => dateTimeMillis_(a["作成日時"]) - dateTimeMillis_(b["作成日時"]));
  return revisions.map((revision, index) => {
    const submittedMillis = dateTimeMillis_(revision["提出日時"] || revision["作成日時"]);
    const nextRevision = revisions[index + 1];
    const nextSubmittedMillis = nextRevision ? dateTimeMillis_(nextRevision["提出日時"] || nextRevision["作成日時"]) : Infinity;
    const fallbackReturn = notifications.filter(notification => {
      const returnedMillis = dateTimeMillis_(notification["作成日時"]);
      return Number.isFinite(returnedMillis) && (!Number.isFinite(submittedMillis) || returnedMillis >= submittedMillis) && returnedMillis < nextSubmittedMillis;
    }).slice(-1)[0] || null;
    const returnReason = String(revision["差戻し理由"] || workReportReturnReasonFromNotification_(fallbackReturn) || "");
    return {
      revisionId: String(revision.revision_id || ""),
      revisionNumber: Number(revision["改訂番号"]) || 0,
      editType: String(revision["編集種別"] || ""),
      editorName: String(revision["編集者氏名"] || revision["編集者メール"] || ""),
      submittedAt: displayDateTime_(revision["提出日時"] || revision["作成日時"]),
      current: String(report.current_revision_id || "") === String(revision.revision_id || ""),
      returnReason,
      returnedAt: displayDateTime_(revision["差戻し日時"] || fallbackReturn && fallbackReturn["作成日時"] || ""),
      answers: answers.filter(answer => String(answer.revision_id || "") === String(revision.revision_id || "")).sort(workReportItemSort_).map(publicWorkReportAnswer_)
    };
  }).reverse();
}
function workReportReturnReasonFromNotification_(notification) {
  if (!notification) return "";
  return String(notification["本文"] || "").replace(/^実績報告が差し戻されました。理由:\s*/, "").trim();
}

function currentWorkReportAnswers_(report, sourceAnswers) {
  const answers = sourceAnswers || rows_(SHEETS.reportAnswers);
  const reportId = String(report && report.report_id || "");
  const revisionId = String(report && report.current_revision_id || "");
  if (revisionId) return answers.filter(answer => String(answer.revision_id || "") === revisionId);
  return answers.filter(answer => String(answer.report_id || "") === reportId && !answer.revision_id);
}

function pendingWorkReportRevision_(report, sourceRevisions) {
  const currentNumber = Number(report && report.current_revision_number) || 0;
  return (sourceRevisions || rows_(SHEETS.reportRevisions))
    .filter(revision => String(revision.report_id || "") === String(report && report.report_id || "") && (String(revision["状態"] || "") === "保存中" || (String(revision["状態"] || "") === "提出済み" && Number(revision["改訂番号"] || 0) > currentNumber)))
    .sort((a, b) => Number(b["改訂番号"] || 0) - Number(a["改訂番号"] || 0))[0] || null;
}

function mergeWorkReportDraftAnswers_(currentAnswers, pendingAnswers) {
  const merged = (currentAnswers || []).slice();
  (pendingAnswers || []).forEach(answer => {
    const index = merged.findIndex(candidate => String(candidate.item_id || "") === String(answer.item_id || ""));
    if (index >= 0) merged[index] = answer;
    else merged.push(answer);
  });
  return merged;
}

function workReportDefinitionsFor_(templateId, currentAnswers) {
  const definitions = (currentAnswers || []).map(answer => ({
    item_id: answer.item_id,
    template_id: templateId,
    "項目名": answer["項目名"],
    "種別": answer["種別"],
    "カテゴリID": answer["カテゴリID"],
    "カテゴリ名": answer["カテゴリ名"],
    "表示順": answer["表示順"],
    "必須": false,
    "有効": false,
    "定義版": answer["定義版"]
  }));
  const seen = definitions.map(item => String(item.item_id || ""));
  activeWorkReportItems_(templateId).forEach(item => {
    if (!seen.includes(String(item.item_id || ""))) definitions.push(item);
  });
  return definitions.sort(workReportItemSort_);
}

function workReportAnswersEqual_(currentAnswers, normalizedAnswers) {
  if (currentAnswers.length !== normalizedAnswers.length) return false;
  const currentByItem = currentAnswers.reduce((result, answer) => (result[String(answer.item_id || "")] = publicWorkReportAnswer_(answer), result), Object.create(null));
  return normalizedAnswers.every(answer => {
    const current = currentByItem[String(answer.item.item_id || "")];
    return current && current.type === answer.type && String(current.value) === String(answer.value) && current.inputState === answer.inputState && current.name === String(answer.item["項目名"] || "") && current.categoryName === String(answer.item["カテゴリ名"] || "");
  });
}

function assertStoredWorkReportAnswersMatch_(storedAnswers, normalizedAnswers) {
  const normalizedByItem = normalizedAnswers.reduce((result, answer) => (result[String(answer.item.item_id || "")] = answer, result), Object.create(null));
  const mismatch = storedAnswers.find(stored => {
    const normalized = normalizedByItem[String(stored.item_id || "")];
    if (!normalized || String(stored["種別"] || "") !== normalized.type || String(stored["入力状態"] || "") !== normalized.inputState) return true;
    return normalized.type === "number" ? Number(stored["数値回答"]) !== Number(normalized.value) : String(stored["文章回答"] || "") !== String(sheetText_(normalized.value));
  });
  if (mismatch) throw apiError_("REPORT_SUBMISSION_RETRY_MISMATCH", "同じ送信情報で異なる回答は保存できません。画面を再読込してください。");
}

function activeWorkReportTemplates_() { return rows_(SHEETS.reportTemplates).filter(template => booleanValue_(template["有効"])); }
function publicWorkReportTemplate_(template) { return { templateId: String(template.template_id || ""), name: String(template["テンプレート名"] || ""), active: booleanValue_(template["有効"]) }; }
function publicWorkReportCaseMapping_(mapping) { return { mappingId: String(mapping.mapping_id || ""), planId: String(mapping["開発予定ID"] || ""), planName: String(mapping["開発予定名"] || ""), templateId: String(mapping.template_id || ""), active: booleanValue_(mapping["有効"]), effectiveFrom: displayDateTime_(mapping["有効開始日時"]), effectiveTo: displayDateTime_(mapping["有効終了日時"]) }; }
function workReportTemplateForContext_(context, sourceMappings, sourceTemplates) {
  const mapping = latestWorkReportCaseMapping_((sourceMappings || rows_(SHEETS.reportCaseMappings)).filter(candidate => String(candidate["開発予定ID"] || "") === String(context && context.planId || "") && workReportMappingApplies_(candidate, context)));
  if (!mapping) return null;
  const template = (sourceTemplates || rows_(SHEETS.reportTemplates)).find(candidate => String(candidate.template_id || "") === String(mapping.template_id || "") && (!booleanValue_(mapping["有効"]) || booleanValue_(candidate["有効"])));
  return template ? publicWorkReportTemplate_(template) : null;
}

function workReportMappingApplies_(mapping, context) {
  const completedAt = dateTimeMillis_(context && context.completedAt);
  if (!Number.isFinite(completedAt)) return false;
  const explicitStart = dateTimeMillis_(mapping["有効開始日時"]);
  const explicitEnd = dateTimeMillis_(mapping["有効終了日時"]);
  const legacyEnd = booleanValue_(mapping["有効"]) ? NaN : dateTimeMillis_(mapping["更新日時"] || mapping["作成日時"]);
  const startsAt = Number.isFinite(explicitStart) ? explicitStart : -Infinity;
  const endsAt = Number.isFinite(explicitEnd) ? explicitEnd : Number.isFinite(legacyEnd) ? legacyEnd : booleanValue_(mapping["有効"]) ? Infinity : -Infinity;
  return completedAt >= startsAt && completedAt <= endsAt;
}

function latestWorkReportCaseMapping_(mappings) {
  return (mappings || []).reduce((latest, mapping) => {
    if (!latest) return mapping;
    const latestAt = dateTimeMillis_(latest["更新日時"] || latest["作成日時"] || latest["有効開始日時"]);
    const mappingAt = dateTimeMillis_(mapping["更新日時"] || mapping["作成日時"] || mapping["有効開始日時"]);
    if (!Number.isFinite(mappingAt)) return Number.isFinite(latestAt) ? latest : mapping;
    return !Number.isFinite(latestAt) || mappingAt >= latestAt ? mapping : latest;
  }, null);
}

function workReportCaseCandidates_(schedules) {
  const mappings = rows_(SHEETS.reportCaseMappings);
  const plans = Object.create(null);
  (schedules || []).forEach(schedule => {
    const planId = String(schedule["開発予定ID"] || "");
    if (!planId) return;
    if (!plans[planId]) plans[planId] = { planName: String(schedule["開発予定名"] || schedule["稼働場所"] || planId), workDates: Object.create(null), people: Object.create(null) };
    const workDate = dateKey_(schedule["勤務日"]);
    const person = String(schedule["氏名"] || schedule.email || "").trim();
    if (workDate) plans[planId].workDates[workDate] = true;
    if (person) plans[planId].people[person] = true;
  });
  mappings.forEach(mapping => { const planId = String(mapping["開発予定ID"] || ""); if (planId && !plans[planId]) plans[planId] = { planName: String(mapping["開発予定名"] || planId), workDates: Object.create(null), people: Object.create(null) }; });
  return Object.keys(plans).sort((a, b) => plans[a].planName.localeCompare(plans[b].planName, "ja")).map(planId => {
    const mapping = latestWorkReportCaseMapping_(mappings.filter(candidate => String(candidate["開発予定ID"] || "") === planId));
    const candidate = mapping ? publicWorkReportCaseMapping_(mapping) : { mappingId: "", planId, planName: plans[planId].planName, templateId: DEFAULT_WORK_REPORT_TEMPLATE_ID, active: false };
    candidate.workDates = Object.keys(plans[planId].workDates).sort();
    candidate.people = Object.keys(plans[planId].people).sort((a, b) => a.localeCompare(b, "ja"));
    return candidate;
  });
}

function normalizeWorkReportAnswers_(definitions, answers) {
  const answerMap = Object.create(null);
  answers.forEach(answer => {
    const itemId = String(answer && answer.itemId || "");
    if (!itemId || Object.prototype.hasOwnProperty.call(answerMap, itemId)) throw apiError_("REPORT_ANSWER_DUPLICATE", "重複した実績項目があります。");
    answerMap[itemId] = answer;
  });
  const definitionIds = definitions.map(item => String(item.item_id || ""));
  const unknown = Object.keys(answerMap).find(itemId => !definitionIds.includes(itemId));
  if (unknown) throw apiError_("REPORT_ITEM_INVALID", "停止済みまたは存在しない実績項目が含まれています。");
  return definitions.map(item => {
    const type = String(item["種別"] || "");
    const answer = answerMap[String(item.item_id || "")];
    const raw = answer ? answer.value : null;
    if (type === "number") {
      const blank = raw === null || raw === undefined || raw === "";
      if (blank && booleanValue_(item["必須"])) throw apiError_("REPORT_REQUIRED", `${item["項目名"]}を入力してください。`);
      const validNumber = typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0;
      const validDecimal = typeof raw === "string" && /^(?:0|[1-9][0-9]*)$/.test(raw) && Number.isSafeInteger(Number(raw));
      if (!blank && !validNumber && !validDecimal) throw apiError_("REPORT_NUMBER_INVALID", `${item["項目名"]}は0以上の整数で入力してください。`);
      const value = blank ? 0 : Number(raw);
      return { item, type, value, inputState: blank ? "defaulted" : "answered" };
    }
    if (type !== "text") throw apiError_("REPORT_ITEM_TYPE_INVALID", "実績項目の種別を確認できません。");
    const value = String(raw == null ? "" : raw).trim();
    if (!value && booleanValue_(item["必須"])) throw apiError_("REPORT_REQUIRED", `${item["項目名"]}を入力してください。`);
    if (value.length > 5000) throw apiError_("REPORT_TEXT_TOO_LONG", `${item["項目名"]}は5000文字以内で入力してください。`);
    return { item, type, value, inputState: value ? "answered" : "blank" };
  });
}

function normalizeWorkReportFilters_(payload) {
  const currentMonth = today_().slice(0, 7);
  const dateFrom = dateKey_(payload.dateFrom || `${currentMonth}-01`);
  const dateTo = dateKey_(payload.dateTo || monthEnd_(currentMonth));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) throw apiError_("REPORT_FILTER_INVALID", "集計期間を確認してください。");
  const groupBy = ["day", "month", "store", "person", "plan"].includes(String(payload.groupBy || "")) ? String(payload.groupBy) : "day";
  return { dateFrom, dateTo, groupBy, status: String(payload.status || ""), query: String(payload.query || "").trim().toLowerCase() };
}
function matchesWorkReportFilters_(row, filters) { const statusMatch = !filters.status || row.status === filters.status || (filters.status === "未提出" && row.status === "保存未完了"); const haystack = [row.workDate, row.storeName, row.planId, row.planName, row.reporterName, row.reporterEmail].join(" ").toLowerCase(); return statusMatch && (!filters.query || haystack.includes(filters.query)); }
function aggregateWorkReportAnswers_(submissions, reportDetails, groupBy) {
  const detailById = reportDetails.reduce((result, detail) => (result[detail.reportId] = detail, result), {});
  const groups = Object.create(null);
  submissions.filter(row => row.status === "提出済み").forEach(row => {
    const group = workReportGroup_(row, groupBy);
    if (!groups[group.key]) groups[group.key] = { key: group.key, label: group.label, reportCount: 0, metrics: Object.create(null) };
    groups[group.key].reportCount += 1;
    const detail = detailById[row.reportId];
    (detail && detail.answers || []).filter(answer => answer.type === "number").forEach(answer => {
      const metricKey = [answer.itemId, answer.type, answer.name, answer.categoryName].join("\u001f");
      if (!groups[group.key].metrics[metricKey]) groups[group.key].metrics[metricKey] = { itemId: answer.itemId, version: answer.version, name: answer.name, categoryName: answer.categoryName, displayOrder: answer.displayOrder, value: 0 };
      groups[group.key].metrics[metricKey].value += Number(answer.value) || 0;
    });
  });
  return Object.keys(groups).sort().map(key => Object.assign({}, groups[key], { metrics: Object.keys(groups[key].metrics).map(metricKey => groups[key].metrics[metricKey]).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "ja")) }));
}
function workReportGroup_(row, groupBy) { if (groupBy === "month") return { key: row.workDate.slice(0, 7), label: row.workDate.slice(0, 7) }; if (groupBy === "store") return { key: row.storeName || "未登録", label: row.storeName || "未登録" }; if (groupBy === "person") return { key: row.reporterEmail || row.reporterName || "未登録", label: row.reporterName || row.reporterEmail || "未登録" }; if (groupBy === "plan") return { key: row.planId || row.planName || "未登録", label: row.planName || row.planId || "未登録" }; return { key: row.workDate, label: row.workDate }; }
function monthEnd_(month) { const parts = String(month).split("-").map(Number); return Utilities.formatDate(new Date(parts[0], parts[1], 0), TZ, "yyyy-MM-dd"); }
function displayDateTime_(value) { if (!value) return ""; if (Object.prototype.toString.call(value) === "[object Date]") return formatJst_(value); return String(value); }
function dateTimeMillis_(value) { if (!value) return NaN; const millis = Object.prototype.toString.call(value) === "[object Date]" ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(millis) ? millis : NaN; }
function safeSpreadsheetText_(value) { const text = String(value == null ? "" : value); return /^(?:[\t\r\n]|\s*[=+\-@])/.test(text) ? "'" + text : text; }
function csvCell_(value) { const text = safeSpreadsheetText_(value); return `"${text.replace(/"/g, '""')}"`; }
function sheetText_(value) { return safeSpreadsheetText_(value); }
function booleanValue_(value) { return value === true || value === 1 || ["true", "1", "yes", "on", "有効", "必須"].includes(String(value || "").trim().toLowerCase()); }
function normalizeDashboardOrder_(value) { const order = Number(value || 0); if (!Number.isInteger(order) || order < 0 || order > 100000) throw apiError_("REPORT_DASHBOARD_ORDER_INVALID", "成績表示順は0以上の整数で入力してください。"); return order; }

function getAdminDashboard_(user, idToken) {
  const today = today_();
  const admin = isAdmin_(user);
  const schedules = admin ? getSchedules_(idToken).filter(r => dateKey_(r["勤務日"]) === today) : [];
  const records = admin ? rows_(SHEETS.records).filter(r => dateKey_(r["勤務日"]) === today) : [];
  const fieldReports = admin ? rows_(SHEETS.fieldReports).filter(r => dateKey_(r["勤務日"]) === today) : [];
  const pendingRequests = rows_(SHEETS.requests).filter(r => String(r["状態"]) === "申請中");
  const reviewerId = internalUserId_(user);
  const requests = admin
    ? pendingRequests
    : pendingRequests.filter(r => String(r.approval_reviewer_internal_user_id || "") === reviewerId);
  const locations = admin && canViewPreciseLocation_(user) ? locationRows_() : [];
  const people = schedules.map(schedule => {
    const record = findScheduleRecordIn_(records, schedule, schedules);
    const matchingReports = fieldReports.filter(r => fieldReportMatchesSchedule_(r, schedule, schedules));
    const departureReport = matchingReports.find(r => String(r["報告種別"]) === "出発");
    const loc = record && locations.find(l => String(l.attendance_record_id) === String(record.record_id));
    const departureLocation = departureReport && locations.find(l => String(l.attendance_record_id) === String(departureReport.field_report_id));
    return { schedule, record: record || null, location: loc || null, departureLocation: departureLocation || null, fieldReports: matchingReports };
  });
  records.filter(record => !schedules.some(s => recordMatchesSchedule_(record, s, schedules))).forEach(record => {
    const loc = locations.find(l => String(l.attendance_record_id) === String(record.record_id));
    people.push({ schedule: null, record, location: loc || null, fieldReports: fieldReports.filter(r => normalizeEmail_(r["報告者メール"]) === normalizeEmail_(record.email)) });
  });
  return { ok: true, serverNow: nowIso_(), people, requests, settings: admin ? settings_() : {}, preciseLocationAccess: admin && canViewPreciseLocation_(user) };
}

function reviewRequest_(user, payload, idToken) {
  if (!["承認", "却下"].includes(payload.decision)) throw apiError_("INVALID_DECISION", "承認または却下を指定してください。");
  if (payload.decision === "却下" && !String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "却下理由を入力してください。");
  ensureRequestContractHeadersForReview_();
  const initial = findRequestById_(payload.requestId);
  assertRequestContract_(initial);
  if (String(initial.approval_reviewer_internal_user_id || "").trim() !== internalUserId_(user)) {
    const unexpectedAuthorization = authorizeAttendanceReview_(initial, payload, idToken);
    if (unexpectedAuthorization && unexpectedAuthorization.authorization_event_id) {
      finalizeAttendanceAudit_(initial, payload, idToken, unexpectedAuthorization.authorization_event_id, unexpectedAuthorization.reviewer_internal_user_id, "error", "申請中", "REVIEWER_ID_NORMALIZATION_MISMATCH");
    }
    throw apiError_("NOT_ASSIGNED_REVIEWER", "この申請の承認者ではありません。");
  }

  const authorization = authorizeAttendanceReview_(initial, payload, idToken);
  const eventId = authorization.authorization_event_id;
  const reviewerId = authorization.reviewer_internal_user_id;
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  let request;
  let record;
  let conflictCode = "";
  let processingError;
  let writeRollbackSucceeded = true;
  try {
    request = findRequestById_(payload.requestId);
    if (!request || request["状態"] !== "申請中") {
      conflictCode = "REQUEST_NOT_PENDING";
    } else {
      assertRequestContract_(request);
      const currentVersion = Number(request.request_version);
      if (!Number.isInteger(Number(payload.expectedRequestVersion)) || Number(payload.expectedRequestVersion) !== currentVersion || currentVersion !== Number(initial.request_version)) {
        conflictCode = "VERSION_CONFLICT";
      } else {
        const nextStatus = payload.decision + "済み";
        record = request.record_id ? rows_(SHEETS.records).find(r => String(r.record_id) === String(request.record_id)) : null;
        updateById_(SHEETS.requests, "request_id", payload.requestId, { "状態": nextStatus, request_version: currentVersion + 1, "承認者メール": user.email, "承認者氏名": user.name || "", "承認理由": payload.reason || "", "処理日時": new Date() });
        if (request.record_id) {
          const formalChanges = { "更新日時": new Date() };
          if (payload.decision === "承認") {
            if (request["申請開始"]) formalChanges["正式開始"] = request["申請開始"];
            if (request["申請終了"]) formalChanges["正式終了"] = request["申請終了"];
            if (request["種別"] === "入店遅延報告") formalChanges["状態"] = record && record["実終了"] ? "終了済み" : "稼働中";
            if (request["種別"] === "日付またぎ終了報告") formalChanges["状態"] = "終了済み";
          } else {
            if (request["種別"] === "入店遅延報告") formalChanges["状態"] = "入店却下";
            if (request["種別"] === "日付またぎ終了報告") formalChanges["状態"] = "終了却下";
          }
          updateById_(SHEETS.records, "record_id", request.record_id, formalChanges);
        }
      }
    }
  } catch (error) {
    processingError = error;
    try {
      if (request) restoreAttendanceReview_(request, record);
    } catch (rollbackError) {
      writeRollbackSucceeded = false;
      processingError.rollback_error = rollbackError.code || rollbackError.message;
    }
  } finally {
    lock.releaseLock();
  }

  if (conflictCode) {
    finalizeAttendanceAudit_(request || initial, payload, idToken, eventId, reviewerId, "conflict", "申請中", conflictCode);
    throw apiError_(conflictCode, conflictCode === "REQUEST_NOT_PENDING" ? "申請はすでに処理されています。" : "申請が更新されています。再読込してください。");
  }
  if (processingError) {
    const result = writeRollbackSucceeded ? "error" : "recovery_required";
    finalizeAttendanceAudit_(request || initial, payload, idToken, eventId, reviewerId, result, "申請中", `${processingError.code || processingError.message}${processingError.rollback_error ? ":" + processingError.rollback_error : ""}`);
    if (!writeRollbackSucceeded) throw apiError_("RECOVERY_REQUIRED", "承認更新の復元に失敗しました。管理者確認が必要です。");
    throw processingError;
  }

  const nextStatus = payload.decision + "済み";
  try {
    finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, "success", nextStatus, "");
  } catch (finalizeError) {
    handleAttendanceFinalizeFailure_(request, record, payload, idToken, eventId, reviewerId, finalizeError);
  }
  try {
    createNotification_(request["申請者メール"], request["申請者氏名"], "申請結果", `${request["種別"]}は${payload.decision}されました。`, payload.requestId);
  } catch (notificationError) {
    console.error("Attendance approval notification failed", notificationError);
  }
  return { ok: true, requestVersion: Number(request.request_version) + 1 };
}

function approvalContractPayload_(request, payload, idToken, phase) {
  return { phase: phase, idToken: idToken, request_id: request.request_id, decision: payload.decision, reason: payload.reason || "", request_version: Number(request.request_version), applicant_internal_user_id: request.applicant_internal_user_id, approval_reviewer_internal_user_id: request.approval_reviewer_internal_user_id, applicant_organization_version: Number(request.applicant_organization_version) };
}

function authorizeAttendanceReview_(request, payload, idToken) {
  try {
    return accountApprovalRequest_(approvalContractPayload_(request, payload, idToken, "authorize"));
  } catch (error) {
    if (error.code === "APPROVAL_ROUTE_CHANGED") markRouteForReconfirmation_(request);
    throw error;
  }
}

function finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, result, resultStatus, errorCode) {
  return accountApprovalRequest_(Object.assign(approvalContractPayload_(request, payload, idToken, "finalize"), {
    authorization_event_id: eventId,
    reviewer_internal_user_id: reviewerId,
    result: result,
    result_status: resultStatus,
    error_code: errorCode || ""
  }));
}

function handleAttendanceFinalizeFailure_(request, record, payload, idToken, eventId, reviewerId, originalError) {
  try {
    finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, "success", payload.decision + "済み", "");
    return;
  } catch (retryError) {
    originalError = retryError;
  }
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  let rollbackSucceeded = false;
  let rollbackError;
  try {
    const current = findRequestById_(request.request_id);
    const expectedStatus = payload.decision + "済み";
    if (!current || String(current["状態"]) !== expectedStatus || Number(current.request_version) !== Number(request.request_version) + 1) {
      throw apiError_("ROLLBACK_STATE_CHANGED", "復元対象の申請状態が変わっています。");
    }
    restoreAttendanceReview_(request, record);
    rollbackSucceeded = true;
  } catch (error) {
    rollbackError = error;
  } finally {
    lock.releaseLock();
  }

  const result = rollbackSucceeded ? "error" : "recovery_required";
  const errorCode = rollbackSucceeded
    ? (originalError.code || "AUDIT_FINALIZE_FAILED")
    : `${originalError.code || "AUDIT_FINALIZE_FAILED"}:${rollbackError.code || rollbackError.message || "ROLLBACK_FAILED"}`;
  try {
    finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, result, "申請中", errorCode);
  } catch (auditError) {
    throw apiError_("RECOVERY_REQUIRED", "承認結果の整合性を自動確定できませんでした。管理者確認が必要です。");
  }
  if (!rollbackSucceeded) throw apiError_("RECOVERY_REQUIRED", "承認結果の復元に失敗しました。管理者確認が必要です。");
  throw originalError;
}

function markRouteForReconfirmation_(request) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const current = findRequestById_(request.request_id);
    if (!current || String(current["状態"]) !== "申請中" || Number(current.request_version) !== Number(request.request_version)) return;
    updateById_(SHEETS.requests, "request_id", request.request_id, { "状態": "経路再確認", request_version: Number(request.request_version) + 1, "処理日時": new Date() });
  } finally {
    lock.releaseLock();
  }
}

function findRequestById_(requestId) {
  return rows_(SHEETS.requests).find(r => String(r.request_id) === String(requestId)) || null;
}

function assertRequestContract_(request) {
  if (!request || String(request["状態"]) !== "申請中") throw apiError_("REQUEST_NOT_FOUND", "申請が見つからないか、処理済みです。");
  if (!request.applicant_internal_user_id || !request.request_version || !request.approval_reviewer_internal_user_id) throw apiError_("LEGACY_REQUEST_REAPPLY_REQUIRED", "旧形式の申請です。本人確認後に再申請してください。");
}

function accountApprovalRequest_(payload) {
  const request = Object.assign({ action: "attendanceApprovalContract" }, payload);
  request.service_secret = PropertiesService.getScriptProperties().getProperty("ATTENDANCE_APPROVAL_SERVICE_SECRET") || "";
  const response = UrlFetchApp.fetch(ACCOUNT_APPROVAL_API_RUNTIME_URL, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify(request), muteHttpExceptions: true });
  let result;
  try { result = JSON.parse(response.getContentText() || "{}"); } catch (error) { result = {}; }
  if (!result.ok) throw apiError_(result.code || "ACCOUNT_APPROVAL_UNAVAILABLE", result.message || "承認経路を確認できません。");
  return result;
}

function restoreAttendanceReview_(request, record) {
  updateById_(SHEETS.requests, "request_id", request.request_id, { "状態": request["状態"], request_version: request.request_version, "承認者メール": request["承認者メール"] || "", "承認者氏名": request["承認者氏名"] || "", "承認理由": request["承認理由"] || "", "処理日時": request["処理日時"] || "" });
  if (record) updateById_(SHEETS.records, "record_id", record.record_id, { "状態": record["状態"] || "", "正式開始": record["正式開始"] || "", "正式終了": record["正式終了"] || "", "更新日時": record["更新日時"] || "" });
}

function updateEndWarningTime_(user, payload) {
  requireAdmin_(user);
  const value = String(payload.time || "");
  if (!/^([01]\d|2[0-1]):[0-5]\d$/.test(value)) throw apiError_("INVALID_TIME", "通知時刻は00:00〜21:59で指定してください。");
  updateById_(SHEETS.settings, "設定キー", "end_warning_time", { "設定値": value, "変更者": user.email, "変更日時": new Date() });
  return { ok: true, settings: settings_() };
}

function markNotificationRead_(user, payload) {
  const notification = rows_(SHEETS.notifications).find(r => String(r.notification_id) === String(payload.notificationId));
  if (!notification || normalizeEmail_(notification["宛先メール"]) !== normalizeEmail_(user.email)) throw apiError_("NOT_FOUND", "通知が見つかりません。");
  updateById_(SHEETS.notifications, "notification_id", payload.notificationId, { "既読": true, "既読日時": new Date() });
  return { ok: true };
}

function saveLocation_(user, recordId, location, plannedLocation) {
  const status = String(location.status || "取得失敗");
  const id = Utilities.getUuid();
  const sheet = SpreadsheetApp.openById(locationSpreadsheetId_()).getSheetByName("位置情報ログ");
  const now = new Date();
  sheet.appendRow([
    id, recordId, user.organization_id || "", user.employee_code || "", now,
    location.latitude == null ? "" : location.latitude,
    location.longitude == null ? "" : location.longitude,
    location.accuracy == null ? "" : location.accuracy,
    status,
    location.consentVersion || "2026-08-02-v1", location.consentAt ? new Date(location.consentAt) : "", plannedLocation || "",
    "未確認", "", "", addDays_(now, 7)
  ]);
  return { id, status };
}

function validateDepartureLocation_(location) {
  if (!location || typeof location !== "object") throw apiError_("DEPARTURE_LOCATION_REQUIRED", "出発位置情報を確認できません。画面を再読み込みしてください。");
  const status = String(location.status || "");
  if (!["取得済み", "取得失敗", "許可なし"].includes(status)) throw apiError_("DEPARTURE_LOCATION_INVALID", "出発位置情報の状態が不正です。");
  const normalized = {
    status: status,
    consentVersion: String(location.consentVersion || ""),
    consentAt: location.consentAt || ""
  };
  if (status !== "取得済み") return normalized;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracy) || accuracy < 0) {
    throw apiError_("DEPARTURE_LOCATION_INVALID", "出発位置情報の値が不正です。");
  }
  normalized.latitude = latitude;
  normalized.longitude = longitude;
  normalized.accuracy = accuracy;
  return normalized;
}

function notifyManagers_(subjectUser, title, message) {
  const managers = managerEmails_(subjectUser.organization_id);
  createNotification_(subjectUser.email, subjectUser.name || "", title, message, "");
  managers.forEach(m => createNotification_(m.email, m.name, title, message, ""));
  const recipients = [subjectUser.email].concat(managers.map(m => m.email)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  if (recipients.length) sendAttendanceMail_({ to: recipients.join(","), subject: `[Another Portal] ${title}`, body: message });
}

function createNotification_(email, name, type, body, targetId) {
  if (!email) return;
  append_(SHEETS.notifications, [Utilities.getUuid(), email, name || "", type, type, body, targetId || "", false, "送信済み", new Date(), ""]);
  invalidateDashboardReferenceCache_({ email });
}

function managerEmails_(organizationId) {
  const values = SpreadsheetApp.getActive().getSheetByName("管理者") || null;
  const managers = values ? objects_(values).filter(r => !organizationId || !r.organization_id || String(r.organization_id) === String(organizationId)).filter(r => isAdminRole_(r.role)).map(r => ({ email: r.email, name: r.name || "" })) : [];
  if (managers.length) return managers;
  const owner = Session.getEffectiveUser().getEmail();
  return owner ? [{ email: owner, name: "Another Portal管理者" }] : [];
}

function getSchedules_(idToken) {
  const result = syncSchedules_(idToken);
  if (result.synced) markDashboardScheduleSyncFresh_();
  return result.schedules;
}

function getDashboardSchedules_(idToken) {
  const local = rows_(SHEETS.schedules);
  const cache = dashboardScheduleSyncCache_();
  const key = dashboardScheduleSyncCacheKey_();
  const cached = readDashboardScheduleSyncState_(cache, key);
  if (cached) return { schedules: local, sync: { status: cached.status === "syncing" ? "in-progress" : "fresh-cache", syncedAt: cached.syncedAt || "" } };

  if (cache && !claimDashboardScheduleSync_(cache, key)) {
    const claimed = readDashboardScheduleSyncState_(cache, key);
    return { schedules: local, sync: { status: claimed && claimed.status === "fresh" ? "fresh-cache" : "in-progress", syncedAt: claimed && claimed.syncedAt || "" } };
  }

  const result = syncSchedules_(idToken, local);
  if (result.synced) {
    markDashboardScheduleSyncFresh_(cache, key);
    return { schedules: result.schedules, sync: { status: "refreshed", syncedAt: nowIso_() } };
  }
  clearDashboardScheduleSyncState_(cache, key);
  return { schedules: local, sync: { status: "failed", syncedAt: "" } };
}

function dashboardScheduleSyncStatus_() {
  const cache = dashboardScheduleSyncCache_();
  const cached = readDashboardScheduleSyncState_(cache, dashboardScheduleSyncCacheKey_());
  if (!cached) return { status: "stale", syncedAt: "" };
  return {
    status: cached.status === "syncing" ? "in-progress" : "fresh-cache",
    syncedAt: cached.syncedAt || ""
  };
}

function syncSchedules_(idToken, sourceLocal) {
  const local = sourceLocal || rows_(SHEETS.schedules);
  try {
    const targetMonth = Utilities.formatDate(new Date(), TZ, "yyyy-MM");
    const response = UrlFetchApp.fetch(SHIFTBUILDER_API_URL, {
      method: "post",
      contentType: "text/plain;charset=utf-8",
      payload: JSON.stringify({ action: "shiftBuilderGetMonthData", idToken: idToken, targetMonth: targetMonth, area: "all" }),
      muteHttpExceptions: true
    });
    const result = JSON.parse(response.getContentText() || "{}");
    if (!result || result.success !== true) throw new Error("ShiftBuilder API returned an unsuccessful response");
    const cases = result.data && Array.isArray(result.data.cases) ? result.data.cases : [];
    const derived = [];
    cases.forEach(caseItem => {
      const cells = caseItem.cells || {};
      Object.keys(cells).forEach(workDate => {
        const cell = cells[workDate] || {};
        (Array.isArray(cell.assigned) ? cell.assigned : []).forEach(member => {
          derived.push({
            schedule_id: member.assignment_id || member.assignmentId || `${caseItem.caseId || "plan"}-${workDate}-${member.internal_user_id || member.internalUserId || member.employee_code || member.email || "member"}`,
            organization_id: member.organization_id || "",
            employee_code: member.employee_code || member.account_code || "",
            email: member.email || member.mail || member.gmail || "",
            "氏名": member.display_name || member.displayName || member.name || "",
            "勤務日": workDate,
            "予定開始": cell.start_time || cell.startTime || caseItem.start_time || caseItem.startTime || "",
            "予定終了": cell.end_time || cell.endTime || caseItem.end_time || caseItem.endTime || "",
            "稼働場所": caseItem.shiftcore_display_name || caseItem.shiftcoreDisplayName || caseItem.store_name || caseItem.storeName || caseItem.title || caseItem.client || caseItem.area || "場所未定",
            "開発予定ID": caseItem.caseId || "",
            "開発予定名": caseItem.shiftcore_display_name || caseItem.title || caseItem.caseId || "開発予定"
          });
        });
      });
    });
    return { schedules: mergeSchedules_(local, derived), synced: true };
  } catch (error) {
    console.warn("ShiftBuilder schedule fetch failed", error);
    return { schedules: local, synced: false };
  }
}

function dashboardScheduleSyncCache_() {
  try { return typeof CacheService === "undefined" ? null : CacheService.getScriptCache(); } catch (error) { return null; }
}
function dashboardScheduleSyncCacheKey_() { return `attendance-dashboard-schedule-sync:${attendanceRuntimeEnvironment_()}:${Utilities.formatDate(new Date(), TZ, "yyyy-MM")}`; }
function readDashboardScheduleSyncState_(cache, key) {
  if (!cache) return null;
  try { const value = cache.get(key); return value ? JSON.parse(value) : null; } catch (error) { return null; }
}
function claimDashboardScheduleSync_(cache, key) {
  if (!cache) return true;
  let lock = null;
  let acquired = false;
  try {
    lock = LockService.getScriptLock();
    acquired = lock.tryLock(1000);
    if (!acquired) return false;
    if (readDashboardScheduleSyncState_(cache, key)) return false;
    cache.put(key, JSON.stringify({ status: "syncing" }), DASHBOARD_SCHEDULE_SYNC_IN_PROGRESS_SECONDS);
    return true;
  } catch (error) {
    return true;
  } finally {
    if (lock && acquired) lock.releaseLock();
  }
}
function markDashboardScheduleSyncFresh_(sourceCache, sourceKey) {
  const cache = sourceCache || dashboardScheduleSyncCache_();
  if (!cache) return;
  try {
    cache.put(sourceKey || dashboardScheduleSyncCacheKey_(), JSON.stringify({ status: "fresh", syncedAt: nowIso_() }), DASHBOARD_SCHEDULE_SYNC_TTL_SECONDS);
    invalidateAllDashboardReferenceCache_();
  } catch (error) {}
}
function clearDashboardScheduleSyncState_(cache, key) { if (!cache) return; try { cache.remove(key); } catch (error) {} }

function mergeSchedules_(local, derived) {
  const result = local.slice();
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.schedules);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const syncedFields = ["organization_id", "employee_code", "email", "氏名", "勤務日", "予定開始", "予定終了", "稼働場所", "開発予定ID", "開発予定名"];
  derived.forEach(item => {
    const key = String(item.schedule_id || "");
    const existingIndex = result.findIndex(existing => String(existing.schedule_id || "") === key);
    if (existingIndex < 0) {
      result.push(item);
      append_(SHEETS.schedules, [
        item.schedule_id, item.organization_id || "", item.employee_code || "", item.email || "", item["氏名"] || "",
        item["勤務日"] || "", item["予定開始"] || "", item["予定終了"] || "", item["稼働場所"] || "",
        item["開発予定ID"] || "", item["開発予定名"] || "", new Date()
      ]);
      return;
    }

    const existing = result[existingIndex];
    const changed = syncedFields.some(field => String(existing[field] || "") !== String(item[field] || ""));
    if (changed) {
      const merged = Object.assign({}, existing, item, { "同期日時": new Date() });
      result[existingIndex] = merged;
      sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([headers.map(header => merged[header] == null ? "" : merged[header])]);
    }
  });
  return result;
}

function matchesUser_(schedule, user) {
  const emailMatch = schedule.email && normalizeEmail_(schedule.email) === normalizeEmail_(user.email);
  const employeeMatch = schedule.employee_code && String(schedule.employee_code) === String(user.employee_code || user.account_code || "");
  const idMatch = schedule.internal_user_id && String(schedule.internal_user_id) === String(user.internal_user_id || user.internalUserId || user.user_id || "");
  return Boolean(emailMatch || employeeMatch || idMatch);
}

function setupAttendanceTriggers() {
  const handlerNames = ["runAttendanceNotifications", "cleanupExpiredLocations"];
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlerNames.includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("runAttendanceNotifications").timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger("cleanupExpiredLocations").timeBased().atHour(2).everyDays(1).inTimezone(TZ).create();
}

function runAttendanceNotifications() {
  const now = new Date();
  const current = timeKey_(now);
  const today = today_();
  const settings = settings_();
  const schedules = rows_(SHEETS.schedules).filter(r => dateKey_(r["勤務日"]) === today);
  const records = rows_(SHEETS.records).filter(r => dateKey_(r["勤務日"]) === today);

  if (current >= settings.start_warning_time && current < settings.start_limit_time) {
    schedules.forEach(schedule => {
      const record = records.find(r => matchesUser_(schedule, r));
      const targetId = `start-warning-${today}-${schedule.schedule_id}`;
      if (!record || !record["実開始"]) {
        if (!notificationExists_(schedule.email, "稼働開始未確認", targetId)) {
          notifyScheduledPerson_(schedule, "稼働開始未確認", "9:30時点で稼働開始が確認できません。10:00までに、これまで押下していなかった理由を添えて開始してください。", targetId);
        }
      }
    });
  }

  if (current >= settings.end_warning_time && current < settings.end_limit_time) {
    records.filter(record => record["実開始"] && !record["実終了"]).forEach(record => {
      const targetId = `end-warning-${today}-${record.record_id}`;
      if (!notificationExists_(record.email, "稼働終了未確認", targetId)) {
        notifyScheduledPerson_(record, "稼働終了未確認", `${settings.end_warning_time}時点で稼働終了が確認できません。${settings.end_limit_time}までに終了操作を行ってください。`, targetId);
      }
    });
  }
}

function notifyScheduledPerson_(subject, title, message, targetId) {
  const managers = managerEmails_(subject.organization_id);
  createNotification_(subject.email, subject["氏名"] || subject.name || "", title, message, targetId);
  managers.forEach(manager => {
    if (!notificationExists_(manager.email, title, targetId)) createNotification_(manager.email, manager.name, title, message, targetId);
  });
  const recipients = [subject.email].concat(managers.map(manager => manager.email)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  if (recipients.length) sendAttendanceMail_({ to: recipients.join(","), subject: `[Another Portal] ${title}`, body: message });
}

function notificationExists_(email, type, targetId) {
  return rows_(SHEETS.notifications).some(row => normalizeEmail_(row["宛先メール"]) === normalizeEmail_(email) && String(row["種別"]) === String(type) && String(row["対象ID"]) === String(targetId));
}

function cleanupExpiredLocations() {
  const sheet = SpreadsheetApp.openById(locationSpreadsheetId_()).getSheetByName("位置情報ログ");
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const expiryCol = headers.indexOf("削除予定日");
  const recordCol = headers.indexOf("attendance_record_id");
  const pendingRecordIds = rows_(SHEETS.requests).filter(r => String(r["状態"]) === "申請中").map(r => String(r.record_id || ""));
  const now = new Date();
  for (let index = values.length - 1; index >= 1; index -= 1) {
    const expiry = values[index][expiryCol];
    const recordId = String(values[index][recordCol] || "");
    if (expiry instanceof Date && expiry.getTime() <= now.getTime() && !pendingRecordIds.includes(recordId)) sheet.deleteRow(index + 1);
  }
}


function findRecord_(email, date, scheduleId) {
  const matches = rows_(SHEETS.records).filter(r => normalizeEmail_(r.email) === normalizeEmail_(email) && dateKey_(r["勤務日"]) === date);
  if (!scheduleId) return matches[0] || null;
  const exact = matches.find(r => String(r.schedule_id || "") === String(scheduleId));
  if (exact) return exact;
  return null;
}
function findActiveRecord_(email) { return rows_(SHEETS.records).find(r => normalizeEmail_(r.email) === normalizeEmail_(email) && r["実開始"] && !r["実終了"]) || null; }
function findActiveRecords_(email) { return rows_(SHEETS.records).filter(r => normalizeEmail_(r.email) === normalizeEmail_(email) && r["実開始"] && !r["実終了"]); }
function assertNoOtherActiveSchedule_(email, scheduleId) { if (findActiveRecords_(email).some(r => String(r.schedule_id || "") !== String(scheduleId || ""))) throw apiError_("OTHER_SCHEDULE_ACTIVE", "別の予定が稼働中です。先にその予定の終了報告を行ってください。"); }
function selectClockOutRecord_(email, scheduleId) {
  const activeRecords = findActiveRecords_(email);
  if (activeRecords.length > 1) throw apiError_("MULTIPLE_ACTIVE_RECORDS", "稼働中の記録が複数あります。管理者へ確認してください。");
  return scheduleId ? findRecordBySchedule_(email, scheduleId) : activeRecords[0] || findRecord_(email, today_());
}
function findRecordBySchedule_(email, scheduleId) { if (!scheduleId) return null; const matches = rows_(SHEETS.records).filter(r => normalizeEmail_(r.email) === normalizeEmail_(email) && String(r.schedule_id || "") === String(scheduleId)); return matches.length ? matches[matches.length - 1] : null; }
function findSchedule_(user, date, scheduleId, idToken) { return getSchedules_(idToken).find(r => matchesUser_(r, user) && dateKey_(r["勤務日"]) === date && (!scheduleId || String(r.schedule_id) === String(scheduleId))) || null; }
function findScheduleById_(user, scheduleId, idToken, sourceSchedules) { if (!scheduleId) return null; return (sourceSchedules || getSchedules_(idToken)).find(r => matchesUser_(r, user) && String(r.schedule_id || "") === String(scheduleId)) || null; }
function findPendingOvernightReport_(user, today, sourceReports) {
  const previousDate = Utilities.formatDate(addDays_(new Date(`${today}T00:00:00+09:00`), -1), TZ, "yyyy-MM-dd");
  const reports = (sourceReports || rows_(SHEETS.fieldReports)).filter(r => normalizeEmail_(r["報告者メール"]) === normalizeEmail_(user.email) && dateKey_(r["勤務日"]) === previousDate && r.schedule_id);
  for (let index = reports.length - 1; index >= 0; index -= 1) {
    const report = reports[index];
    const sameSchedule = reports.filter(r => String(r.schedule_id || "") === String(report.schedule_id || ""));
    if (String(report["報告種別"]) === "出発" && !sameSchedule.some(r => String(r["報告種別"]) === "入店")) return report;
  }
  return null;
}
function recordMatchesSchedule_(record, schedule, schedules) {
  if (normalizeEmail_(record.email) !== normalizeEmail_(schedule.email)) return false;
  if (record.schedule_id) return String(record.schedule_id) === String(schedule.schedule_id || "");
  const sameUserSchedules = schedules.filter(s => normalizeEmail_(s.email) === normalizeEmail_(schedule.email));
  return sameUserSchedules.length === 1;
}
function findScheduleRecordIn_(records, schedule, schedules) { return records.find(record => recordMatchesSchedule_(record, schedule, schedules)) || null; }
function fieldReportMatchesSchedule_(report, schedule, schedules) {
  if (normalizeEmail_(report["報告者メール"]) !== normalizeEmail_(schedule.email)) return false;
  if (report.schedule_id) return String(report.schedule_id) === String(schedule.schedule_id || "");
  const samePlanSchedules = schedules.filter(s => normalizeEmail_(s.email) === normalizeEmail_(schedule.email) && String(s["開発予定ID"] || "") === String(schedule["開発予定ID"] || ""));
  return samePlanSchedules.length === 1 && String(report["開発予定ID"] || "") === String(schedule["開発予定ID"] || "");
}
function hasPendingApproval_(recordId, type) { return rows_(SHEETS.requests).some(r => String(r.record_id || "") === String(recordId || "") && String(r["種別"] || "") === String(type || "") && String(r["状態"] || "") === "申請中"); }
function findApprovalRequestId_(recordId, type) { const request = rows_(SHEETS.requests).find(r => String(r.record_id || "") === String(recordId || "") && String(r["種別"] || "") === String(type || "") && ["申請中", "承認済み"].includes(String(r["状態"] || ""))); return request ? String(request.request_id || "") : ""; }
function findTodayPlans_(user, idToken) { return getSchedules_(idToken).filter(r => matchesUser_(r, user) && dateKey_(r["勤務日"]) === today_()).map(r => ({ id: r["開発予定ID"] || r.schedule_id, name: r["開発予定名"] || r["稼働場所"] || "当日の開発予定" })); }
function findPlansForDate_(user, idToken, workDate) { return getSchedules_(idToken).filter(r => matchesUser_(r, user) && dateKey_(r["勤務日"]) === workDate).map(r => ({ id: r["開発予定ID"] || r.schedule_id, name: r["開発予定名"] || r["稼働場所"] || "当日の開発予定" })); }
function rows_(name) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); return sheet ? objects_(sheet) : []; }
function locationRows_() { const sheet = SpreadsheetApp.openById(locationSpreadsheetId_()).getSheetByName("位置情報ログ"); return objects_(sheet); }

function locationSpreadsheetId_() {
  const id = settings_().location_spreadsheet_id;
  if (!id) throw apiError_("CONFIG_MISSING", "位置情報保存先が設定されていません。");
  return id;
}
function objects_(sheet) { const values = sheet.getDataRange().getValues(); if (values.length < 2) return []; const headers = values.shift().map(String); return values.filter(row => row.some(v => v !== "")).map(row => headers.reduce((o, h, i) => (o[h] = row[i], o), {})); }
function append_(name, values) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${name}シートがありません。`); sheet.appendRow(values); }
function appendObject_(name, value) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${name}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); const missing = Object.keys(value).filter(key => !headers.includes(key)); if (missing.length) throw apiError_("SHEET_SCHEMA_MISMATCH", `${name}シートの列が不足しています: ${missing.join(",")}`); sheet.appendRow(headers.map(header => value[header] == null ? "" : value[header])); }
function appendObjects_(name, values) { if (!values.length) return; const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${name}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); const missing = values.reduce((result, value) => result.concat(Object.keys(value).filter(key => !headers.includes(key))), []).filter((value, index, all) => all.indexOf(value) === index); if (missing.length) throw apiError_("SHEET_SCHEMA_MISMATCH", `${name}シートの列が不足しています: ${missing.join(",")}`); const rows = values.map(value => headers.map(header => value[header] == null ? "" : value[header])); sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows); }
function updateById_(sheetName, idColumn, id, changes) { const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName); const values = sheet.getDataRange().getValues(); const headers = values[0].map(String); const rowIndex = values.findIndex((r, i) => i > 0 && String(r[headers.indexOf(idColumn)]) === String(id)); if (rowIndex < 1) throw apiError_("NOT_FOUND", "対象データが見つかりません。"); Object.keys(changes).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sheet.getRange(rowIndex + 1, col + 1).setValue(changes[k]); }); }
function settings_() { return rows_(SHEETS.settings).reduce((o, r) => (o[String(r["設定キー"])] = String(r["設定値"]), o), {}); }
function ensureReportSheet_() { const ss = SpreadsheetApp.getActive(); if (!ss.getSheetByName(SHEETS.reports)) { const s = ss.insertSheet(SHEETS.reports); s.appendRow(HEADERS.reports); s.setFrozenRows(1); } }
function ensureWorkReportSheetsWithLock_() { const lock = LockService.getDocumentLock(); lock.waitLock(20000); try { return ensureWorkReportSheets_(); } finally { lock.releaseLock(); } }
function assertWorkReportSchema_() {
  assertSheetHeaders_(SHEETS.reports, HEADERS.reports.concat(HEADERS.reportContract));
  assertSheetHeaders_(SHEETS.reportTemplates, HEADERS.reportTemplates);
  assertSheetHeaders_(SHEETS.reportCaseMappings, HEADERS.reportCaseMappings);
  assertSheetHeaders_(SHEETS.reportRevisions, HEADERS.reportRevisions);
  assertSheetHeaders_(SHEETS.reportItems, HEADERS.reportItems);
  assertSheetHeaders_(SHEETS.reportAnswers, HEADERS.reportAnswers);
}
function assertSheetHeaders_(name, requiredHeaders) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${name}シートがありません。管理者が実績報告の初期設定を実行してください。`);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const duplicate = headers.find((header, index) => header && headers.indexOf(header) !== index);
  if (duplicate) throw apiError_("SHEET_SCHEMA_MISMATCH", `${name}シートに重複列があります: ${duplicate}`);
  const missing = requiredHeaders.filter(header => !headers.includes(header));
  if (missing.length) throw apiError_("SHEET_SCHEMA_MISMATCH", `${name}シートの列が不足しています: ${missing.join(",")}。管理者が実績報告の初期設定を実行してください。`);
}
function ensureWorkReportSheets_() {
  ensureReportSheet_();
  ensureReportContractHeaders_();
  ensureAppendOnlySheet_(SHEETS.reportTemplates, HEADERS.reportTemplates);
  ensureAppendOnlySheet_(SHEETS.reportCaseMappings, HEADERS.reportCaseMappings);
  ensureAppendOnlySheet_(SHEETS.reportRevisions, HEADERS.reportRevisions.concat(HEADERS.reportRevisionReturnContract));
  ensureAppendOnlySheet_(SHEETS.reportItems, HEADERS.reportItems);
  ensureAppendOnlySheet_(SHEETS.reportAnswers, HEADERS.reportAnswers);
  let templates = rows_(SHEETS.reportTemplates);
  let items = rows_(SHEETS.reportItems);
  if (!templates.length) {
    const now = new Date();
    appendObject_(SHEETS.reportTemplates, { template_id: DEFAULT_WORK_REPORT_TEMPLATE_ID, "テンプレート名": "ドコモ案件", "有効": true, "作成日時": now, "更新日時": now });
    templates = rows_(SHEETS.reportTemplates);
  }
  if (!items.length) {
    const now = new Date();
    appendObjects_(SHEETS.reportItems, DEFAULT_WORK_REPORT_ITEMS.map(item => ({
      item_id: item[0], template_id: DEFAULT_WORK_REPORT_TEMPLATE_ID, "項目名": item[1], "種別": item[2], "カテゴリID": item[3], "カテゴリ名": item[4], "表示順": item[5], "必須": item[6], "有効": true, "定義版": 1,
      "ダッシュボード表示": ["responseCount", "u39Mnp", "u39New", "smartphoneSales"].includes(item[0]), "ダッシュボード名": item[1], "ダッシュボード順": item[5], "作成日時": now, "更新日時": now
    })));
    items = rows_(SHEETS.reportItems);
  } else {
    const missingTemplateItems = items.filter(item => !item.template_id);
    missingTemplateItems.forEach(item => updateById_(SHEETS.reportItems, "item_id", item.item_id, { template_id: DEFAULT_WORK_REPORT_TEMPLATE_ID }));
    if (missingTemplateItems.length) items = rows_(SHEETS.reportItems);
  }
  return { templates, items };
}
function ensureReportRevisionReturnHeaders_() { ensureAppendOnlySheet_(SHEETS.reportRevisions, HEADERS.reportRevisions.concat(HEADERS.reportRevisionReturnContract)); }
function ensureAppendOnlySheet_(name, headers) { const ss = SpreadsheetApp.getActive(); let sheet = ss.getSheetByName(name); if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); sheet.setFrozenRows(1); return; } const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); const duplicate = existing.find((header, index) => header && existing.indexOf(header) !== index); if (duplicate) throw apiError_("SHEET_SCHEMA_MISMATCH", `${name}シートに重複列があります: ${duplicate}`); headers.forEach(header => { if (!existing.includes(header)) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); existing.push(header); } }); }
function ensureReportContractHeaders_() { const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.reports); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${SHEETS.reports}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); const duplicate = headers.find((header, index) => header && headers.indexOf(header) !== index); if (duplicate) throw apiError_("SHEET_SCHEMA_MISMATCH", `${SHEETS.reports}シートに重複列があります: ${duplicate}`); const missingExisting = HEADERS.reports.filter(header => !headers.includes(header)); if (missingExisting.length) throw apiError_("SHEET_SCHEMA_MISMATCH", `${SHEETS.reports}シートの既存列が不足しています: ${missingExisting.join(",")}`); HEADERS.reportContract.forEach(header => { if (!headers.includes(header)) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); headers.push(header); } }); }
function ensureFieldReportSheet_() { const ss = SpreadsheetApp.getActive(); if (!ss.getSheetByName(SHEETS.fieldReports)) { const s = ss.insertSheet(SHEETS.fieldReports); s.appendRow(HEADERS.fieldReports); s.setFrozenRows(1); } }
function ensureFieldReportContractHeaders_() { const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.fieldReports); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${SHEETS.fieldReports}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); if (!headers.includes("schedule_id")) sheet.getRange(1, sheet.getLastColumn() + 1).setValue("schedule_id"); }
function ensureRecordContractHeaders_() { const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.records); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${SHEETS.records}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); if (!headers.includes("schedule_id")) sheet.getRange(1, sheet.getLastColumn() + 1).setValue("schedule_id"); }
function scheduleReportKey_(schedule) { return String(schedule && (schedule.schedule_id || schedule["開発予定ID"]) || ""); }
function fieldReportsFor_(user, workDate, scheduleKey, planId, sourceReports, sourceSchedules) {
  const allowLegacy = Boolean(planId) && legacyScheduleUnambiguous_(user, workDate, planId, sourceSchedules);
  return (sourceReports || rows_(SHEETS.fieldReports)).filter(r => normalizeEmail_(r["報告者メール"]) === normalizeEmail_(user.email) && dateKey_(r["勤務日"]) === workDate && (!scheduleKey || String(r.schedule_id || "") === String(scheduleKey) || (allowLegacy && !r.schedule_id && String(r["開発予定ID"] || "") === String(planId))));
}
function legacyScheduleUnambiguous_(user, workDate, planId, sourceSchedules) { return (sourceSchedules || rows_(SHEETS.schedules)).filter(r => matchesUser_(r, user) && dateKey_(r["勤務日"]) === workDate && String(r["開発予定ID"] || "") === String(planId || "")).length === 1; }
function ensureRequestContractHeaders_() { const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.requests); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${SHEETS.requests}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); const duplicate = headers.find((header, index) => header && headers.indexOf(header) !== index); if (duplicate) throw apiError_("SHEET_SCHEMA_MISMATCH", `${SHEETS.requests}シートに重複列があります: ${duplicate}`); const missingExisting = HEADERS.requests.filter(header => !headers.includes(header)); if (missingExisting.length) throw apiError_("SHEET_SCHEMA_MISMATCH", `${SHEETS.requests}シートの既存列が不足しています: ${missingExisting.join(",")}`); HEADERS.requestContract.forEach(header => { if (!headers.includes(header)) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); headers.push(header); } }); }
function ensureRequestContractHeadersForReview_() { const lock = LockService.getDocumentLock(); lock.waitLock(20000); try { ensureRequestContractHeaders_(); } finally { lock.releaseLock(); } }
function publicUser_(user) { return { internal_user_id: internalUserId_(user), name: user.name || "", email: user.email || "", role: user.role || "", organization_id: user.organization_id || "", employee_code: user.employee_code || "", employment_type: user.employment_type || user.contract_type || "" }; }
function internalUserId_(user) { return String(user && (user.internal_user_id || user.internalUserId || user.user_id || user.userId) || "").trim(); }
function hasApprovalReviewAccess_(user) { const userId = internalUserId_(user); return Boolean(userId) && rows_(SHEETS.requests).some(request => String(request["状態"]) === "申請中" && String(request.approval_reviewer_internal_user_id || "") === userId); }
function isAdminRole_(role) { return ["admin", "manager", "team_leader", "leader", "executive", "labor", "hr", "developer", "dev"].includes(String(role || "").toLowerCase()); }
function isAdmin_(user) { return isAdminRole_(user.role); }
function canViewPreciseLocation_(user) { return ["admin", "executive", "labor", "hr", "developer", "dev"].includes(String(user.role || "").toLowerCase()); }
function requireAdmin_(user) { if (!isAdmin_(user)) throw apiError_("FORBIDDEN", "管理者権限が必要です。"); }
function normalizeEmail_(v) { return String(v || "").trim().toLowerCase(); }
function today_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }
function dateKey_(v) { if (!v) return ""; if (Object.prototype.toString.call(v) === "[object Date]") return Utilities.formatDate(v, TZ, "yyyy-MM-dd"); return String(v).slice(0, 10).replace(/\//g, "-"); }
function timeKey_(d) { return Utilities.formatDate(d, TZ, "HH:mm"); }
function jstDateTime_(workDate, time) { const normalizedTime = String(time || "").match(/\d{1,2}:\d{2}/); if (!workDate || !normalizedTime) return null; const hhmm = normalizedTime[0].padStart(5, "0"); return new Date(`${dateKey_(workDate)}T${hhmm}:00+09:00`); }
function buildTimingStatus_(schedule, now) {
  const workDate = dateKey_(schedule && schedule["勤務日"]);
  const start = jstDateTime_(workDate, schedule && schedule["予定開始"]);
  const rawEnd = jstDateTime_(workDate, schedule && schedule["予定終了"]);
  if (!start || !rawEnd || Number.isNaN(start.getTime()) || Number.isNaN(rawEnd.getTime())) throw apiError_("SCHEDULE_TIME_REQUIRED", "予定開始・予定終了時刻を確認できません。");
  const end = rawEnd.getTime() <= start.getTime() ? addDays_(rawEnd, 1) : rawEnd;
  const current = now instanceof Date ? now : new Date(now);
  const departureLimit = new Date(start.getTime() - 60 * 60 * 1000);
  const arrivalLimit = new Date(start.getTime() - 15 * 60 * 1000);
  const endWarningLimit = new Date(end.getTime() + 60 * 60 * 1000);
  return {
    workDate: workDate,
    plannedStart: start.toISOString(), plannedEnd: end.toISOString(),
    departureLimit: departureLimit.toISOString(), arrivalLimit: arrivalLimit.toISOString(), endWarningLimit: endWarningLimit.toISOString(),
    departureWarning: current.getTime() > departureLimit.getTime(),
    arrivalWarning: current.getTime() > arrivalLimit.getTime(),
    arrivalApprovalRequired: current.getTime() >= start.getTime(),
    endWarning: current.getTime() > endWarningLimit.getTime(),
    endApprovalRequired: dateKey_(current) > workDate
  };
}
function safeTimingStatus_(schedule, now) { try { return buildTimingStatus_(schedule, now); } catch (error) { if (error.code === "SCHEDULE_TIME_REQUIRED") return null; throw error; } }
function formatJst_(d) { return Utilities.formatDate(d, TZ, "yyyy/MM/dd HH:mm"); }
function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function addDays_(d, days) { return new Date(d.getTime() + days * 86400000); }
function apiError_(code, message) { const e = new Error(message); e.code = code; return e; }
function jsonOutput_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
