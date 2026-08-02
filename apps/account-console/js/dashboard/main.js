import { auth, signOut, onAuthStateChanged } from "./auth.js";
import { getStoredUser, clearStoredUser } from "./storage.js";
import { goToLogin } from "./navigation.js";
import { renderModules } from "./modules.js";
import { attendanceRequest } from "./attendance-api.js";
import { LOCATION_CONSENT_VERSION } from "./config.js?v=20260802-attendance-2";

const $ = id => document.getElementById(id);
const storedUser = getStoredUser();
let dashboardData = null;
let busy = false;

if (!storedUser) {
  showStatus("セッション情報がありません。ログイン画面へ戻ります。", true);
  setTimeout(goToLogin, 800);
} else {
  renderIdentity(storedUser);
  renderModules(storedUser.allowed_modules || [], storedUser, showStatus);
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    clearStoredUser();
    goToLogin();
    return;
  }
  await loadDashboard();
});

async function loadDashboard() {
  try {
    dashboardData = await attendanceRequest("getDashboardData");
    renderDashboard(dashboardData);
    showStatus("最新の勤怠情報を表示しています");
  } catch (error) {
    showStatus(error.message, true);
    renderUnavailable();
  }
}

function renderIdentity(user) {
  const name = user.name || user.email || "利用者";
  $("userName").textContent = name;
  $("greetingName").textContent = name;
  $("userInitial").textContent = name.slice(0, 1).toUpperCase();
  $("emailText").textContent = user.email || "";
  $("accountMeta").textContent = [user.role, user.organization_id].filter(Boolean).join(" / ");
  $("todayLabel").textContent = new Intl.DateTimeFormat("ja-JP", { dateStyle: "full", timeZone: "Asia/Tokyo" }).format(new Date()).toUpperCase();
}

function renderDashboard(data) {
  const schedule = data.schedule;
  const record = data.record;
  const direct = isDirectEmployment(data.user);
  $("startBtn").textContent = direct ? "出勤" : "稼働開始";
  $("endBtn").textContent = direct ? "退勤" : "稼働終了";
  $("adminLink").hidden = !data.adminAccess;
  $("workLocation").textContent = schedule?.["稼働場所"] || record?.["予定場所"] || "予定なし（予定外稼働可）";
  $("weatherLocation").textContent = schedule?.["稼働場所"] || "稼働場所未設定";
  $("plannedTime").textContent = schedule ? `${timeText(schedule["予定開始"])} – ${timeText(schedule["予定終了"])}` : "—";
  $("startedAt").textContent = timeText(record?.["実開始"]);
  $("endedAt").textContent = timeText(record?.["実終了"]);
  const status = record?.["状態"] || "未開始";
  $("workStatus").textContent = status;
  $("workStatus").dataset.status = status;
  $("startBtn").hidden = Boolean(record?.["実開始"]);
  $("endBtn").hidden = !record?.["実開始"] || Boolean(record?.["実終了"]);
  const now = jstTime(data.serverNow);
  $("correctionBtn").hidden = !((!record?.["実開始"] && now >= data.settings.start_limit_time) || (record?.["実開始"] && !record?.["実終了"] && now >= data.settings.end_limit_time));
  if (now >= data.settings.start_warning_time && !record?.["実開始"] && now < data.settings.start_limit_time) showAlert("稼働開始が確認できません。開始時に、これまで押下していなかった理由を入力してください。", "warning");
  if (now >= data.settings.end_warning_time && record?.["実開始"] && !record?.["実終了"]) showAlert("稼働終了が確認できません。22:00までに終了操作を行ってください。", "warning");
  renderUpcoming(data.upcoming || []);
  renderNotifications(data.notifications || []);
}

function renderUnavailable() {
  $("workStatus").textContent = "接続待ち";
  $("workLocation").textContent = "勤怠APIの公開完了後に表示します";
  $("startBtn").disabled = true;
  $("endBtn").disabled = true;
}

function renderUpcoming(items) {
  $("upcomingList").innerHTML = items.length ? items.map(item => `<div class="schedule-item"><time>${escapeHtml(dateText(item["勤務日"]))}</time><div><strong>${escapeHtml(item["稼働場所"] || "場所未定")}</strong><span>${escapeHtml(`${timeText(item["予定開始"])} – ${timeText(item["予定終了"])}`)}</span></div></div>`).join("") : `<div class="empty-state">直近の稼働予定はありません。</div>`;
}

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
  panel.hidden = !panel.hidden;
  $("notificationBtn").setAttribute("aria-expanded", String(!panel.hidden));
});
$("notificationCloseBtn").addEventListener("click", () => { $("notificationPanel").hidden = true; });

$("startBtn").addEventListener("click", async () => {
  if (busy || !dashboardData) return;
  const now = jstTime(dashboardData.serverNow);
  if (now >= dashboardData.settings.start_limit_time) return openCorrection("開始修正");
  const reasonRequired = now >= dashboardData.settings.start_warning_time || !dashboardData.schedule;
  const body = `${!dashboardData.schedule ? `<label>稼働場所<input id="workLocationInput" required placeholder="本日の稼働場所"></label>` : ""}${reasonRequired ? reasonFields("これまで押下していなかった理由") : `<p>現在時刻で稼働を開始します。</p>`}`;
  const accepted = await openDialog("稼働開始", body, "開始する");
  if (!accepted) return;
  const reason = readReason();
  if (reasonRequired && !reason) return showStatus("理由を入力してください。", true);
  await confirmLocationAndClockIn({
    reason,
    unplanned: !dashboardData.schedule,
    workLocation: $("workLocationInput")?.value || "",
    scheduleId: dashboardData.schedule?.schedule_id || "",
    planId: dashboardData.schedule?.["開発予定ID"] || ""
  });
});

$("endBtn").addEventListener("click", async () => {
  if (busy || !dashboardData) return;
  const now = jstTime(dashboardData.serverNow);
  if (now >= dashboardData.settings.end_limit_time) return openCorrection("終了修正");
  const accepted = await openDialog("稼働終了", "<p>現在時刻で稼働を終了します。保存に成功した後、実績報告へ移動します。</p>", "終了する");
  if (!accepted) return;
  await runAction(async () => {
    const result = await attendanceRequest("clockOut");
    sessionStorage.setItem("shiftcore_report_context", JSON.stringify({ recordId: result.record.record_id, plans: result.plans || [] }));
    window.location.href = "./work-report.html";
  });
});

$("correctionBtn").addEventListener("click", () => openCorrection(dashboardData?.record?.["実開始"] ? "終了修正" : "開始修正"));

async function openCorrection(type) {
  const body = `<label>実際の${type === "開始修正" ? "開始" : "終了"}時刻<input id="actualTime" type="datetime-local" required></label>${reasonFields("修正申請の理由")}`;
  if (!await openDialog(type, body, "申請する")) return;
  const actual = $("actualTime")?.value;
  const reason = readReason();
  if (!actual || !reason) return showStatus("実際の時刻と理由を入力してください。", true);
  await runAction(async () => {
    await attendanceRequest("submitCorrection", { type, recordId: dashboardData?.record?.record_id || "", workDate: dashboardData.today, actualStart: type === "開始修正" ? actual : "", actualEnd: type === "終了修正" ? actual : "", reasonType: $("reasonType")?.value || "その他", reason });
    showAlert("修正申請を送信しました。管理者の確認をお待ちください。", "success");
    await loadDashboard();
  });
}

async function confirmLocationAndClockIn(payload) {
  let consent = localStorage.getItem("shiftcore_location_consent");
  if (!consent) {
    $("locationConsentDialog").showModal();
    consent = await new Promise(resolve => {
      $("locationConsentDialog").addEventListener("close", () => resolve($("locationConsentDialog").returnValue || "deny"), { once: true });
    });
    localStorage.setItem("shiftcore_location_consent", JSON.stringify({ value: consent, version: LOCATION_CONSENT_VERSION, at: new Date().toISOString() }));
  } else { try { consent = JSON.parse(consent).value; } catch { consent = "deny"; } }
  const location = consent === "allow" ? await getLocation() : { status: "許可なし", consentVersion: LOCATION_CONSENT_VERSION };
  await runAction(async () => { await attendanceRequest("clockIn", { ...payload, location }); await loadDashboard(); showAlert("稼働開始を記録しました。", "success"); });
}

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
  try { await action(); } catch (error) { showStatus(error.message, true); if (/通信|fetch|network/i.test(error.message)) showAlert("打刻を記録できませんでした。上席へ電話またはLINEで報告し、復旧後に修正申請してください。", "danger"); } finally { busy = false; document.body.classList.remove("is-busy"); }
}

$("logoutBtn").addEventListener("click", async () => { await signOut(auth); clearStoredUser(); goToLogin(); });
$("backToLoginBtn").addEventListener("click", goToLogin);
function showStatus(message, error = false) { $("statusBox").textContent = message; $("statusBox").classList.toggle("error", error); }
function showAlert(message, type) { $("alertArea").innerHTML = `<div class="inline-alert ${type}">${escapeHtml(message)}</div>`; }
function jstTime(iso) { return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(new Date(iso)); }
function timeText(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value).slice(-5) : jstTime(d.toISOString()); }
function dateText(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(d); }
function dateTimeText(value) { if (!value) return ""; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(d); }
function truthy(v) { return v === true || String(v).toLowerCase() === "true"; }
function isDirectEmployment(user) { return /正社員|契約社員|direct|employee/i.test(user.employment_type || ""); }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }
