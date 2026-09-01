import { auth, signOut, onAuthStateChanged } from "./auth.js?v=20260802-attendance-3";
import { getStoredUser, saveStoredUser, clearStoredUser } from "./storage.js?v=20260802-modules-2";
import { goToLogin } from "./navigation.js?v=20260803-role-1";
import { renderModules, renderModuleMenu } from "./modules.js?v=20260812-developer-1";
import { attendanceRequest } from "./attendance-api.js?v=20260802-attendance-3";
import { resolveCurrentUserWithGasByIdToken } from "../login/api.js?v=20260803-logintoken-1";
import { LOCATION_CONSENT_VERSION } from "./config.js?v=20260831-departure-location-1";
import { setActivity } from "../common/activity.js?v=20260831-activity-1";

const $ = id => document.getElementById(id);
const storedUser = getStoredUser();
// TEST環境と本番は同一originのため、端末キャッシュも環境単位で分離する。
const dashboardEnvironment = window.ShiftCoreEnvironment?.name || "production";
const dashboardCacheKey = `shiftcore_attendance_dashboard:${dashboardEnvironment}:${storedUser?.email || storedUser?.employee_code || "anonymous"}`;
let dashboardData = null;
let busy = false;
let selectedScheduleId = "";
let dashboardLoadVersion = 0;
const SCHEDULE_SYNC_RETRY_DELAY_MS = 2000;
const MAX_SCHEDULE_SYNC_RETRIES = 6;

if (!storedUser) {
  showStatus("セッション情報がありません。ログイン画面へ戻ります。", true);
  setTimeout(goToLogin, 800);
} else {
  renderIdentity(storedUser);
  renderModules(storedUser.allowed_modules || [], storedUser, showStatus);
  renderModuleMenu(storedUser.allowed_modules || [], storedUser, showStatus);
  const cachedDashboard = readDashboardCache();
  if (cachedDashboard) {
    dashboardData = cachedDashboard;
    if (cachedDashboard.schedule || cachedDashboard.record) {
      renderDashboard(cachedDashboard);
      renderDashboardLoading({ preserveSchedule: true });
      showStatus("前回確認した当日の情報を表示しています。最新情報を確認中です。", false, true);
    } else {
      renderDashboardLoading();
      showStatus("打刻に必要な勤怠情報を読み込んでいます…", false, true);
    }
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    clearStoredUser();
    goToLogin();
    return;
  }
  // 打刻に必要な勤怠を最優先し、メニュー権限の再確認は初期表示後に回す。
  await loadDashboard();
  void refreshModuleAccess(user);
});

async function refreshModuleAccess(firebaseUser) {
  try {
    const idToken = await firebaseUser.getIdToken();
    const result = await resolveCurrentUserWithGasByIdToken(idToken);
    if (!result?.ok || !result.user) return;
    saveStoredUser(result.user);
    renderIdentity(result.user);
    renderModules(result.user.allowed_modules || [], result.user, showStatus);
    renderModuleMenu(result.user.allowed_modules || [], result.user, showStatus);
  } catch (_) {
    // 権限の再取得に失敗した場合は、ログイン時の保存情報で表示を継続する。
  }
}

async function loadDashboard() {
  const loadVersion = ++dashboardLoadVersion;
  renderDashboardLoading({
    preserveSchedule: Boolean(dashboardData?.schedule || dashboardData?.record)
  });
  showStatus("打刻に必要な勤怠情報を読み込んでいます…", false, true);
  try {
    const loadedDashboard = await attendanceRequest("getDashboardData", { scheduleId: selectedScheduleId });
    if (loadVersion !== dashboardLoadVersion) return;
    dashboardData = loadedDashboard;
    selectedScheduleId = dashboardData.schedule?.schedule_id || selectedScheduleId;
    rememberServerTiming("dashboard", dashboardData.serverTiming);
    const syncStatus = dashboardData.scheduleSync?.status;
    const scheduleSyncPending = isScheduleSyncPending(dashboardData);
    if (scheduleSyncPending) renderDashboardLoading();
    else {
      renderDashboard(dashboardData);
      writeDashboardCache(dashboardData);
    }
    if (scheduleSyncPending) showStatus("最新の稼働予定を確認しています…", false, true);
    else if (syncStatus === "fresh-cache") showStatus("5分以内に同期済みの予定を表示しています");
    else if (syncStatus === "in-progress") showStatus("勤怠情報を表示しました。別の画面で最新予定を同期中です。", false, true);
    else showStatus("勤怠情報を表示しました。最新予定を確認中です。", false, true);
    // 打刻可能な状態を先に返し、重い成績集計と外部予定同期は表示後に並行する。
    const secondaryLoads = [loadMyWorkReportSummary(loadVersion)];
    if (!["fresh-cache", "in-progress"].includes(syncStatus) || scheduleSyncPending) {
      secondaryLoads.push(refreshDashboardInBackground(loadVersion));
    }
    void Promise.allSettled(secondaryLoads);
  } catch (error) {
    if (loadVersion !== dashboardLoadVersion) return;
    showStatus(error.message, true);
    renderUnavailable();
  }
}

async function loadMyWorkReportSummary(loadVersion) {
  try {
    const summary = await attendanceRequest("getMyWorkReportSummary", { month: todayKey().slice(0, 7) });
    if (loadVersion !== dashboardLoadVersion) return;
    rememberServerTiming("performance", summary.serverTiming);
    renderMyWorkReportSummary(summary);
  } catch (error) {
    if (loadVersion !== dashboardLoadVersion) return;
    renderMyWorkReportSummaryError(error.message);
  }
}

async function refreshDashboardInBackground(loadVersion, retryCount = 0) {
  try {
    const refreshed = await attendanceRequest("refreshDashboardData", { scheduleId: selectedScheduleId });
    if (loadVersion !== dashboardLoadVersion) return;
    dashboardData = refreshed;
    const syncStatus = refreshed.scheduleSync?.status;

    if (isScheduleSyncPending(refreshed)) {
      renderDashboardLoading();
      if (retryCount >= MAX_SCHEDULE_SYNC_RETRIES) {
        showStatus("最新予定の同期に時間がかかっています。しばらくして再読み込みしてください。", true);
        return;
      }
      showStatus("別の画面で進行中の最新予定同期を待っています…", false, true);
      await waitFor(SCHEDULE_SYNC_RETRY_DELAY_MS);
      if (loadVersion !== dashboardLoadVersion) return;
      return refreshDashboardInBackground(loadVersion, retryCount + 1);
    }

    if (syncStatus === "failed" && !refreshed.schedule && !refreshed.record) {
      renderUnavailable("最新の稼働予定を確認できませんでした");
      showStatus("最新予定の同期に失敗しました。再読み込みしてください。", true);
      return;
    }

    renderDashboard(refreshed);
    writeDashboardCache(refreshed);
    rememberServerTiming("scheduleSync", refreshed.serverTiming);
    if (syncStatus === "failed") showStatus("保存済み予定を表示中（SB同期失敗）", true);
    else if (syncStatus === "in-progress") showStatus("保存済み予定を表示中（別の画面で最新予定を同期中です）", false, true);
    else if (syncStatus === "fresh-cache") showStatus("5分以内に同期済みの予定を表示しています");
    else showStatus("SBの最新予定を反映しました");
  } catch (error) {
    if (loadVersion !== dashboardLoadVersion) return;
    showStatus(`保存済み予定を表示中（SB同期失敗: ${error.message}）`, true);
  }
}

function isScheduleSyncPending(data) {
  const syncStatus = data?.scheduleSync?.status;
  return !data?.schedule && !data?.record && ["stale", "in-progress"].includes(syncStatus);
}

function waitFor(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function rememberServerTiming(name, timing) {
  const totalMs = Number(timing?.totalMs);
  if (!Number.isFinite(totalMs) || totalMs < 0) return;
  $("statusBox").dataset[`${name}ServerMs`] = String(Math.round(totalMs));
  ["authMs", "referenceMs", "recordsMs", "assembleMs", "dashboardMs"].forEach(key => {
    const value = Number(timing?.[key]);
    if (Number.isFinite(value) && value >= 0) $("statusBox").dataset[`${name}${key[0].toUpperCase()}${key.slice(1)}`] = String(Math.round(value));
  });
  if (timing?.referenceCache) $("statusBox").dataset[`${name}ReferenceCache`] = String(timing.referenceCache);
  if (timing?.recordsCache) $("statusBox").dataset[`${name}RecordsCache`] = String(timing.recordsCache);
}

function renderMyWorkReportSummaryError(message) {
  setActivity($("performanceLoading"), false);
  setActivity($("performanceMonth"), false);
  renderWorkReportActionAlert([]);
  $("performanceLoading").textContent = `成績を読み込めませんでした: ${message}`;
  $("performanceLoading").classList.add("error");
}

function renderMyWorkReportSummary(summary) {
  setActivity($("performanceLoading"), false);
  setActivity($("performanceMonth"), false);
  $("performanceMonth").textContent = `${summary.month.replace("-", "年")}月`;
  $("performanceMetrics").innerHTML = (summary.metrics || []).length ? summary.metrics.map(metric => `<article><small>${escapeHtml(metric.label)}</small><strong>${Number(metric.value).toLocaleString("ja-JP")}</strong><span>件</span></article>`).join("") : '<div class="empty-state">今月の提出済み実績はまだありません。</div>';
  const counts = summary.counts || {};
  $("performanceSubmissionSummary").innerHTML = `<span>対象 ${Number(counts.total || 0)}件</span><span>提出済み ${Number(counts.submitted || 0)}件</span><span>未提出 ${Number(counts.missing || 0)}件</span>${counts.returned ? `<span class="needs-action">要修正 ${Number(counts.returned)}件</span>` : ""}`;
  $("myReportRows").innerHTML = (summary.submissions || []).map(item => `<article><div><small>${escapeHtml(item.workDate)}</small><strong>${escapeHtml(item.storeName || item.planName || "実績報告")}</strong><span>${escapeHtml(item.status)}${item.revisionNumber ? `・第${item.revisionNumber}版` : ""}</span>${item.returnReason ? `<p>${escapeHtml(item.returnReason)}</p>` : ""}</div>${item.editable ? `<button type="button" data-open-my-report="${escapeHtml(item.recordId)}">${item.status === "未提出" ? "入力" : "確認・修正"}</button>` : ""}</article>`).join("");
  document.querySelectorAll("[data-open-my-report]").forEach(button => button.addEventListener("click", () => openMyWorkReport(button.dataset.openMyReport)));
  renderWorkReportActionAlert(summary.submissions || []);
  $("performanceLoading").hidden = true;
  $("performanceContent").hidden = false;
}

function renderWorkReportActionAlert(submissions) {
  const alert = $("workReportActionAlert");
  const returned = submissions.filter(item => item.status === "差戻し中" && item.editable);
  if (!returned.length) {
    alert.hidden = true;
    alert.replaceChildren();
    return;
  }
  const target = returned[0];
  alert.innerHTML = `<div><strong>実績報告の修正依頼があります</strong><span>${returned.length}件の報告を確認して、修正後に再提出してください。</span></div><button id="openReturnedReportBtn" type="button">修正内容を確認</button>`;
  alert.hidden = false;
  $("openReturnedReportBtn").addEventListener("click", () => openMyWorkReport(target.recordId));
}

function openMyWorkReport(recordId) {
  sessionStorage.setItem("shiftcore_report_context", JSON.stringify({ recordId }));
  window.location.href = "./work-report.html";
}

function readDashboardCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(dashboardCacheKey) || "null");
    if (!cached || cached.today !== todayKey()) return null;
    return cached;
  } catch (_) {
    return null;
  }
}

function writeDashboardCache(data) {
  try {
    // 通知と個人成績は端末へ残さず、当日の打刻表示に必要な情報だけを再利用する。
    localStorage.setItem(dashboardCacheKey, JSON.stringify({ ...data, notifications: [], workReportSummary: null, workReportSummaryError: null }));
  } catch (_) {
    // キャッシュ不可でも通常のAPI表示は継続する。
  }
}

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function renderIdentity(user) {
  const name = user.name || user.email || "利用者";
  $("userName").textContent = name;
  setActivity($("userName"), false);
  $("greetingName").textContent = name;
  $("timeGreeting").textContent = greetingForJst(new Date());
  $("userInitial").textContent = name.slice(0, 1).toUpperCase();
  $("emailText").textContent = user.email || "";
  $("accountMeta").textContent = [user.role, user.organization_id].filter(Boolean).join(" / ");
  const dateParts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(new Date());
  const part = type => dateParts.find(item => item.type === type)?.value || "";
  $("todayLabel").textContent = `${part("year")}年${part("month")}月${part("day")}日（${part("weekday")}）`;
}

function renderDashboard(data) {
  const schedule = data.schedule;
  const record = data.record;
  const primaryState = actionState(data);
  $("startBtn").textContent = primaryState.label;
  $("adminLinks").hidden = !data.adminAccess;
  $("workLocation").textContent = schedule?.["稼働場所"] || record?.["予定場所"] || "非稼働";
  setActivity($("workLocation"), false);
  $("weatherLocation").textContent = schedule?.["稼働場所"] || record?.["予定場所"] || "非稼働";
  $("plannedTime").textContent = schedule ? plannedTimeText(schedule) : "—";
  renderScheduleSelector(data.schedules || [], schedule);
  const fieldReports = data.fieldReports || [];
  const departure = fieldReports.find(report => report["報告種別"] === "出発");
  const arrival = fieldReports.find(report => report["報告種別"] === "入店");
  $("departedAt").textContent = timeText(departure?.["報告日時"]);
  $("arrivedAt").textContent = timeText(arrival?.["報告日時"]);
  $("startedAt").textContent = timeText(record?.["実開始"]);
  $("endedAt").textContent = timeText(record?.["実終了"]);
  const status = record?.["状態"] || (schedule ? "未開始" : "非稼働");
  $("workStatus").textContent = status;
  setActivity($("workStatus"), false);
  $("workStatus").dataset.status = status;
  $("startBtn").disabled = false;
  $("startBtn").hidden = primaryState.hidden;
  $("correctionBtn").hidden = !record;
  $("deadlineNote").textContent = schedule ? "出発は予定開始1時間前、入店は15分前が目安です。" : "本日は稼働予定がありません。";
  renderTimingWarning(data, primaryState.name);
  renderUpcoming(data.upcoming || []);
  renderNotifications(data.notifications || []);
}

function renderDashboardLoading({ preserveSchedule = false } = {}) {
  setActivity($("workStatus"), true, preserveSchedule ? "更新中" : "確認中");
  $("workStatus").dataset.status = "読み込み中";
  $("startBtn").disabled = true;
  $("correctionBtn").hidden = true;

  if (preserveSchedule) {
    $("deadlineNote").textContent = "最新の勤怠情報を確認しています。完了後に操作できます。";
    return;
  }

  setActivity($("workLocation"), true, "稼働予定を読み込んでいます…");
  $("weatherLocation").textContent = "稼働場所を確認中";
  $("plannedTime").textContent = "確認中";
  $("departedAt").textContent = "—";
  $("arrivedAt").textContent = "—";
  $("startedAt").textContent = "—";
  $("endedAt").textContent = "—";
  $("scheduleSelectWrap").hidden = true;
  $("startBtn").textContent = "読み込み中…";
  $("startBtn").hidden = false;
  $("deadlineNote").textContent = "勤怠情報の読み込み完了後に操作できます。";
}

async function submitDeparture() {
  if (busy || !dashboardData?.schedule) return;
  const accepted = await openDialog("出発", "<p>現在時刻と位置情報を添えて出発を報告します。</p>", "出発する");
  if (!accepted) return;
  const location = await readAttendanceLocation();
  await runAction(async () => {
    await attendanceRequest("submitFieldReport", { reportType: "出発", scheduleId: dashboardData.schedule.schedule_id || "", location });
    await loadDashboard();
    showAlert("出発を記録しました。", "success");
  });
}

function renderUnavailable(message = "勤怠情報を確認できませんでした") {
  setActivity($("workStatus"), false);
  setActivity($("workLocation"), false);
  $("workStatus").textContent = "確認エラー";
  $("workStatus").dataset.status = "確認エラー";
  $("workLocation").textContent = message;
  $("startBtn").disabled = true;
  $("startBtn").textContent = "再読み込みしてください";
  $("deadlineNote").textContent = "通信状態を確認し、画面を再読み込みしてください。";
}

function renderUpcoming(items) {
  $("upcomingList").innerHTML = items.length ? items.map(item => `<div class="schedule-item"><time>${escapeHtml(dateText(item["勤務日"]))}</time><div><strong>${escapeHtml(item["稼働場所"] || "場所未定")}</strong><span>${escapeHtml(plannedTimeText(item))}</span></div></div>`).join("") : `<div class="empty-state">直近の稼働予定はありません。</div>`;
}

function renderScheduleSelector(schedules, selected) { const wrap = $("scheduleSelectWrap"); const select = $("scheduleSelect"); wrap.hidden = schedules.length < 2; select.innerHTML = schedules.map(item => `<option value="${escapeHtml(item.schedule_id || "")}" ${String(item.schedule_id || "") === String(selected?.schedule_id || "") ? "selected" : ""}>${escapeHtml(scheduleOptionText(item))}</option>`).join(""); select.disabled = Boolean(dashboardData?.record?.["実開始"] && !dashboardData?.record?.["実終了"]); }
function scheduleOptionText(schedule) { return [schedule?.["開発予定名"] || "案件名未定", plannedTimeText(schedule), schedule?.["稼働場所"] || "場所未定"].join("｜"); }

$("scheduleSelect").addEventListener("change", async event => { if (busy) return; selectedScheduleId = event.target.value; await loadDashboard(); });

function renderNotifications(items) {
  const unread = items.filter(item => !truthy(item["既読"])).length;
  $("notificationBadge").hidden = unread === 0;
  $("notificationBadge").textContent = String(unread);
  $("notificationList").innerHTML = items.length ? items.map(item => `<button class="notification-item ${truthy(item["既読"]) ? "" : "unread"}" data-id="${escapeHtml(item.notification_id)}"><strong>${escapeHtml(item["タイトル"] || item["種別"] || "お知らせ")}</strong><span>${escapeHtml(item["本文"] || "")}</span><small>${escapeHtml(dateTimeText(item["作成日時"]))}</small></button>`).join("") : `<div class="empty-state">通知はありません。</div>`;
  document.querySelectorAll(".notification-item[data-id]").forEach(button => button.addEventListener("click", async () => {
    try { await attendanceRequest("markNotificationRead", { notificationId: button.dataset.id }); button.classList.remove("unread"); } catch (error) { showStatus(error.message, true); }
  }));
}

$("notificationBtn").addEventListener("click", () => {
  const panel = $("notificationPanel");
  closeUserMenu();
  panel.hidden = !panel.hidden;
  $("notificationBtn").setAttribute("aria-expanded", String(!panel.hidden));
});
$("notificationCloseBtn").addEventListener("click", () => { $("notificationPanel").hidden = true; });

$("userMenuBtn").addEventListener("click", () => {
  const panel = $("userMenuPanel");
  $("notificationPanel").hidden = true;
  $("notificationBtn").setAttribute("aria-expanded", "false");
  panel.hidden = !panel.hidden;
  $("userMenuBtn").setAttribute("aria-expanded", String(!panel.hidden));
});
$("userMenuCloseBtn").addEventListener("click", closeUserMenu);
$("userMenuLogoutBtn").addEventListener("click", logoutDashboard);

function closeUserMenu() {
  $("userMenuPanel").hidden = true;
  $("userMenuBtn").setAttribute("aria-expanded", "false");
}

$("startBtn").addEventListener("click", async () => {
  if (busy || !dashboardData) return;
  const state = actionState(dashboardData);
  if (state.name === "departure") return submitDeparture();
  if (state.name === "arrival") return submitArrival();
  if (state.name === "completion") return submitCompletion();
  if (state.name === "unplanned") return submitUnplanned();
});

$("correctionBtn").addEventListener("click", () => openCorrection(dashboardData?.record?.["実開始"] ? "終了修正" : "開始修正"));

async function openCorrection(type) {
  const body = `<label>実際の${type === "開始修正" ? "開始" : "終了"}時刻<input id="actualTime" type="datetime-local" required></label>${reasonFields("修正申請の理由")}`;
  if (!await openDialog(type, body, "申請する")) return;
  const actual = $("actualTime")?.value;
  const reason = readReason();
  if (!actual || !reason) return showStatus("実際の時刻と理由を入力してください。", true);
  await runAction(async () => {
    await attendanceRequest("submitCorrection", { type, recordId: dashboardData?.record?.record_id || "", actualStart: type === "開始修正" ? actual : "", actualEnd: type === "終了修正" ? actual : "", reasonType: $("reasonType")?.value || "その他", reason });
    showAlert("修正申請を送信しました。管理者の確認をお待ちください。", "success");
    await loadDashboard();
  });
}

async function submitArrival() {
  const approvalRequired = Boolean(dashboardData.timing?.arrivalApprovalRequired);
  const body = `${approvalRequired ? reasonFields("予定開始以降になった理由（直属承認が必要です）") : "<p>現在時刻で入店を記録します。</p>"}`;
  if (!await openDialog("入店", body, "入店する")) return;
  const reason = readReason();
  if (approvalRequired && !reason) return showStatus("理由を入力してください。", true);
  const location = await readAttendanceLocation();
  await runAction(async () => {
    const result = await attendanceRequest("arrive", { scheduleId: dashboardData.schedule.schedule_id || "", reason, reasonType: $("reasonType")?.value || "その他", location });
    await loadDashboard();
    showAlert(result.approvalRequired ? "入店を記録し、直属承認を申請しました。" : "入店を記録しました。", "success");
  });
}

async function readAttendanceLocation() {
  let consent = "";
  const storedConsent = localStorage.getItem("shiftcore_location_consent");
  if (storedConsent) {
    try {
      const parsed = JSON.parse(storedConsent);
      if (parsed.version === LOCATION_CONSENT_VERSION) consent = parsed.value;
    } catch (_) {
      consent = "";
    }
  }
  if (!consent) {
    $("locationConsentDialog").showModal();
    consent = await new Promise(resolve => {
      $("locationConsentDialog").addEventListener("close", () => resolve($("locationConsentDialog").returnValue || "deny"), { once: true });
    });
    localStorage.setItem("shiftcore_location_consent", JSON.stringify({ value: consent, version: LOCATION_CONSENT_VERSION, at: new Date().toISOString() }));
  }
  return consent === "allow" ? getLocation() : { status: "許可なし", consentVersion: LOCATION_CONSENT_VERSION };
}

async function submitUnplanned() {
  const body = `<label>稼働場所<input id="workLocationInput" required placeholder="本日の稼働場所"></label>${reasonFields("予定外稼働の理由")}`;
  if (!await openDialog("予定外稼働", body, "開始する")) return;
  const workLocation = $("workLocationInput")?.value?.trim() || "";
  const reason = readReason();
  if (!workLocation || !reason) return showStatus("稼働場所と理由を入力してください。", true);
  const location = await readAttendanceLocation();
  await runAction(async () => {
    const result = await attendanceRequest("clockIn", { unplanned: true, workLocation, reason, reasonType: $("reasonType")?.value || "その他", location });
    await loadDashboard();
    showAlert("予定外稼働を記録しました。", "success");
  });
}

async function submitCompletion() {
  const approvalRequired = Boolean(dashboardData.timing?.endApprovalRequired);
  const body = `${approvalRequired ? reasonFields("通常の終了期限を超過した理由（直属承認が必要です）") : "<p>現在時刻で終了を記録し、実績報告へ進みます。</p>"}`;
  if (!await openDialog("終了報告", body, "終了報告する")) return;
  const reason = readReason();
  if (approvalRequired && !reason) return showStatus("理由を入力してください。", true);
  await runAction(async () => { const result = await attendanceRequest("clockOut", { scheduleId: dashboardData.schedule?.schedule_id || "", reason, reasonType: $("reasonType")?.value || "その他" }); if (result.workReportRequired) { sessionStorage.setItem("shiftcore_report_context", JSON.stringify({ recordId: result.record.record_id })); window.location.href = "./work-report.html"; return; } await loadDashboard(); showAlert("終了報告を記録しました。この案件は実績報告の対象外です。", "success"); });
}

function actionState(data) { const reports = data.fieldReports || []; const departure = reports.some(r => r["報告種別"] === "出発"); const arrival = reports.some(r => r["報告種別"] === "入店"); if (!data.schedule) return data.record?.["実開始"] && !data.record?.["実終了"] ? { name: "completion", label: "終了報告", hidden: false } : { name: "unplanned", label: "予定外稼働", hidden: Boolean(data.record?.["実終了"]) }; if (!departure) return { name: "departure", label: "出発", hidden: false }; if (!arrival || !data.record?.["実開始"]) return { name: "arrival", label: "入店", hidden: false }; if (!data.record?.["実終了"]) return { name: "completion", label: "終了報告", hidden: false }; return { name: "done", label: "終了報告済み", hidden: true }; }
function renderTimingWarning(data, state) { const t = data.timing; if (!t) return showAlert("予定開始・終了時刻が未登録です。管理者へ確認してください。", "warning"); if (state === "departure" && t.departureWarning) return showAlert("出発リミットを過ぎています。安全に注意して出発してください。", "warning"); if (state === "arrival" && t.arrivalApprovalRequired) return showAlert("予定開始時刻以降の入店です。理由の報告と直属承認が必要です。", "warning"); if (state === "arrival" && t.arrivalWarning) return showAlert("入店リミットを過ぎています。", "warning"); if (state === "completion" && t.endApprovalRequired) return showAlert("通常の終了期限を超過しています。理由の報告と直属承認が必要です。", "warning"); if (state === "completion" && t.endWarning) return showAlert("予定終了から1時間を超えています。終了報告を確認してください。", "warning"); showAlert("", ""); }

function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ status: "取得失敗", consentVersion: LOCATION_CONSENT_VERSION });
    navigator.geolocation.getCurrentPosition(position => resolve({ status: "取得済み", latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, consentVersion: LOCATION_CONSENT_VERSION, consentAt: new Date().toISOString() }), () => resolve({ status: "取得失敗", consentVersion: LOCATION_CONSENT_VERSION }), { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  });
}

function openDialog(title, body, submitLabel) {
  $("dialogTitle").textContent = title;
  $("dialogBody").innerHTML = body;
  $("dialogSubmitBtn").textContent = submitLabel;
  $("actionDialog").showModal();
  return new Promise(resolve => $("actionDialog").addEventListener("close", () => resolve($("actionDialog").returnValue === "default"), { once: true }));
}

function reasonFields(label) { return `<label>${label}<select id="reasonType"><option>交通機関の遅延</option><option>体調不良</option><option>業務都合</option><option>失念</option><option>端末・通信障害</option><option>家庭事情</option><option>その他</option></select></label><label>詳細<textarea id="reasonDetail" required placeholder="状況を入力してください"></textarea></label>`; }
function readReason() { const type = $("reasonType")?.value || ""; const detail = $("reasonDetail")?.value?.trim() || ""; return [type, detail].filter(Boolean).join("："); }

async function runAction(action) {
  if (busy) return;
  busy = true;
  document.body.classList.add("is-busy");
  showStatus("処理を送信しています…", false, true);
  try { await action(); } catch (error) { showStatus(error.message, true); if (/通信|fetch|network/i.test(error.message)) showAlert("打刻を記録できませんでした。上席へ電話またはLINEで報告し、復旧後に修正申請してください。", "danger"); } finally { busy = false; document.body.classList.remove("is-busy"); }
}

$("logoutBtn").addEventListener("click", logoutDashboard);

async function logoutDashboard() {
  await signOut(auth);
  clearStoredUser();
  goToLogin();
}
$("backToLoginBtn").addEventListener("click", goToLogin);
function showStatus(message, error = false, loading = false) { setActivity($("statusBox"), loading, message); $("statusBox").classList.toggle("error", error); }
function showAlert(message, type) { $("alertArea").innerHTML = `<div class="inline-alert ${type}">${escapeHtml(message)}</div>`; }
function jstTime(iso) { return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(new Date(iso)); }
function timeText(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value).slice(-5) : jstTime(d.toISOString()); }
function plannedTimeText(schedule) { const start = timeText(schedule?.["予定開始"]); const end = timeText(schedule?.["予定終了"]); return `${start} – ${end}${start !== "—" && end < start ? "（翌日）" : ""}`; }
function dateText(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(d); }
function dateTimeText(value) { if (!value) return ""; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(d); }
function greetingForJst(date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(date));
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}
function truthy(v) { return v === true || String(v).toLowerCase() === "true"; }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }
