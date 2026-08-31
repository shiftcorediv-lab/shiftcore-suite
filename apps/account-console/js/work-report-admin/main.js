import { auth, onAuthStateChanged } from "../dashboard/auth.js";
import { attendanceRequest } from "../dashboard/attendance-api.js";
import { setActivity } from "../common/activity.js?v=20260831-activity-1";

const $ = id => document.getElementById(id);
let data = null;
let returningReportId = "";

setInitialDates();
onAuthStateChanged(auth, user => user ? load() : location.replace("./index.html"));
$("refreshBtn").addEventListener("click", load);
$("applyBtn").addEventListener("click", load);
$("csvBtn").addEventListener("click", () => downloadCsv(false));
$("historyCsvBtn").addEventListener("click", () => downloadCsv(true));
$("showAddItemBtn").addEventListener("click", () => {
  const nextOrder = Math.max(0, ...(data?.items || []).map(item => Number(item.displayOrder) || 0)) + 10;
  $("newDisplayOrder").value = String(nextOrder);
  $("newDashboardOrder").value = String(nextOrder);
  $("itemDialog").showModal();
});
$("cancelItemBtn").addEventListener("click", () => $("itemDialog").close());
$("itemForm").addEventListener("submit", addItem);
$("cancelReturnBtn").addEventListener("click", () => $("returnDialog").close());
$("returnForm").addEventListener("submit", submitReturn);

async function load() {
  message("実績報告を読み込んでいます…", false, true);
  try {
    data = await attendanceRequest("getWorkReportAdminData", filterPayload());
    render();
    message("最新の実績報告を表示しています。");
  } catch (error) {
    message(error.message, true);
    if (error.code === "FORBIDDEN") setTimeout(() => location.replace("./dashboard.html"), 1200);
  }
}

function filterPayload() {
  return {
    dateFrom: $("dateFrom").value,
    dateTo: $("dateTo").value,
    status: $("statusFilter").value,
    query: $("searchInput").value.trim(),
    groupBy: $("groupBy").value
  };
}

function render() {
  $("summary").innerHTML = summaryCard("対象の終了済み勤怠", data.counts.total) + summaryCard("提出済み", data.counts.submitted) + summaryCard("未提出・未完了", data.counts.missing) + summaryCard("差戻し中", data.counts.returned || 0);
  renderSubmissions();
  renderAggregates();
  renderItems();
  renderCaseMappings();
}

function renderSubmissions() {
  const rows = data.submissions || [];
  $("submissionRows").innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td>${escapeHtml(row.workDate)}</td><td><strong>${escapeHtml(row.reporterName)}</strong><br><small>${escapeHtml(row.reporterEmail)}</small></td>
      <td>${escapeHtml(row.storeName || "—")}</td><td>${escapeHtml(row.planName || "—")}</td>
      <td><span class="badge ${row.status === "提出済み" ? "submitted" : ""}">${escapeHtml(row.status)}</span>${row.returnReason ? `<small class="return-reason">${escapeHtml(row.returnReason)}</small>` : ""}</td>
      <td>${row.revisionNumber ? `第${row.revisionNumber}版` : "—"}</td>
      <td>${escapeHtml(row.reportedAt || "—")}</td><td class="row-actions">${row.reportId ? `<button type="button" data-report-id="${escapeAttribute(row.reportId)}">詳細</button>${row.status === "提出済み" ? `<button class="secondary" type="button" data-return-report="${escapeAttribute(row.reportId)}">差戻し</button>` : ""}` : ""}</td>
    </tr>`).join("") : '<tr><td colspan="7">該当する終了済み勤怠はありません。</td></tr>';
  document.querySelectorAll("[data-report-id]").forEach(button => button.addEventListener("click", () => showDetail(button.dataset.reportId)));
  document.querySelectorAll("[data-return-report]").forEach(button => button.addEventListener("click", () => openReturn(button.dataset.returnReport)));
}

function renderAggregates() {
  const rows = [];
  (data.aggregates || []).forEach(group => {
    if (!group.metrics.length) rows.push(`<tr><td>${escapeHtml(group.label)}</td><td>${group.reportCount}</td><td colspan="3">正規化された数値回答はありません。</td></tr>`);
    group.metrics.forEach((metric, index) => rows.push(`<tr><td>${index === 0 ? escapeHtml(group.label) : ""}</td><td>${index === 0 ? group.reportCount : ""}</td><td>${escapeHtml(metric.categoryName)}</td><td>${escapeHtml(metric.name)}</td><td>${Number(metric.value).toLocaleString("ja-JP")}</td></tr>`));
  });
  $("aggregateRows").innerHTML = rows.length ? rows.join("") : '<tr><td colspan="5">集計対象の提出済み報告はありません。</td></tr>';
}

function renderItems() {
  $("itemRows").innerHTML = (data.items || []).map(item => `
    <tr data-item-row="${escapeAttribute(item.itemId)}">
      <td><input data-field="name" value="${escapeAttribute(item.name)}" maxlength="100"></td>
      <td><select data-field="type"><option value="number" ${item.type === "number" ? "selected" : ""}>数値</option><option value="text" ${item.type === "text" ? "selected" : ""}>文章</option></select></td>
      <td><input data-field="categoryName" value="${escapeAttribute(item.categoryName)}" maxlength="60"></td>
      <td><input data-field="displayOrder" type="number" min="0" step="1" value="${item.displayOrder}"></td>
      <td><input data-field="required" type="checkbox" ${item.required ? "checked" : ""}></td>
      <td><input data-field="active" type="checkbox" ${item.active ? "checked" : ""}></td>
      <td><input data-field="dashboardVisible" type="checkbox" ${item.dashboardVisible ? "checked" : ""} ${item.type === "text" ? "disabled" : ""}></td>
      <td><input data-field="dashboardName" value="${escapeAttribute(item.dashboardName || item.name)}" maxlength="40" ${item.type === "text" ? "disabled" : ""}></td>
      <td><input data-field="dashboardOrder" type="number" min="0" step="1" value="${item.dashboardOrder || 0}" ${item.type === "text" ? "disabled" : ""}></td>
      <td>${item.version}</td><td><button type="button" data-save-item="${escapeAttribute(item.itemId)}">保存</button></td>
    </tr>`).join("");
  document.querySelectorAll("[data-save-item]").forEach(button => button.addEventListener("click", () => saveItem(button.dataset.saveItem)));
}

async function saveItem(itemId) {
  const row = document.querySelector(`[data-item-row="${cssEscape(itemId)}"]`);
  if (!row) return;
  const payload = {
    itemId,
    name: field(row, "name").value,
    type: field(row, "type").value,
    categoryName: field(row, "categoryName").value,
    displayOrder: field(row, "displayOrder").value,
    required: field(row, "required").checked,
    active: field(row, "active").checked,
    dashboardVisible: field(row, "dashboardVisible").checked,
    dashboardName: field(row, "dashboardName").value,
    dashboardOrder: field(row, "dashboardOrder").value
  };
  message("実績項目を保存しています…", false, true);
  try {
    await attendanceRequest("saveWorkReportItem", payload);
    message("実績項目を保存しました。");
    await load();
  } catch (error) {
    if (await recoverSavedWorkReportItem(itemId, payload, error)) return;
    message(isNetworkFailure(error) ? "通信が途切れ、保存結果を確認できませんでした。更新して状態を確認してください。" : error.message, true);
  }
}

async function recoverSavedWorkReportItem(itemId, payload, error) {
  if (!isNetworkFailure(error)) return false;
  try {
    const refreshed = await attendanceRequest("getWorkReportAdminData", filterPayload());
    const saved = (refreshed.items || []).find(item => item.itemId === itemId);
    if (!workReportItemMatches(saved, payload)) return false;
    data = refreshed;
    render();
    message("実績項目を保存しました。通信応答が途切れたため、保存結果を再確認しました。");
    return true;
  } catch {
    return false;
  }
}

function workReportItemMatches(item, payload) {
  if (!item) return false;
  const dashboardName = String(payload.dashboardName || payload.name || "").trim();
  return item.itemId === payload.itemId
    && item.name === String(payload.name || "").trim()
    && item.type === payload.type
    && item.categoryName === String(payload.categoryName || "").trim()
    && Number(item.displayOrder) === Number(payload.displayOrder)
    && item.required === Boolean(payload.required)
    && item.active === Boolean(payload.active)
    && item.dashboardVisible === Boolean(payload.dashboardVisible)
    && item.dashboardName === dashboardName
    && Number(item.dashboardOrder) === Number(payload.dashboardOrder || 0);
}

function isNetworkFailure(error) {
  return error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(error?.message || ""));
}

async function addItem(event) {
  event.preventDefault();
  message("実績項目を追加しています…", false, true);
  try {
    await attendanceRequest("saveWorkReportItem", {
      name: $("newItemName").value,
      type: $("newItemType").value,
      categoryName: $("newCategoryName").value,
      displayOrder: $("newDisplayOrder").value,
      required: $("newRequired").checked,
      dashboardVisible: $("newDashboardVisible").checked,
      dashboardName: $("newDashboardName").value,
      dashboardOrder: $("newDashboardOrder").value,
      active: true
    });
    $("itemDialog").close();
    $("itemForm").reset();
    message("実績項目を追加しました。");
    await load();
  } catch (error) {
    message(error.message, true);
  }
}

function showDetail(reportId) {
  const detail = (data.reportDetails || []).find(item => item.reportId === reportId);
  const submission = (data.submissions || []).find(item => item.reportId === reportId);
  if (!detail || !submission) return;
  const rows = [
    ["勤務日", submission.workDate], ["氏名", submission.reporterName], ["店舗", submission.storeName], ["案件", submission.planName]
  ];
  if (detail.legacy) {
    $("detailBody").innerHTML = '<p class="legacy-note">旧形式の報告です。内容を推測して項目別集計へ変換していません。</p>' + detailList(rows.concat([["実績内容", detail.result || "—"], ["課題・申し送り", detail.notes || "—"]]));
  } else {
    const current = detailList(rows.concat([["現在の版", `第${submission.revisionNumber || 0}版`], ...detail.answers.map(answer => [`${answer.categoryName} / ${answer.name}`, answer.type === "number" ? `${answer.value}件${answer.inputState === "defaulted" ? "（未入力を0扱い）" : ""}` : answer.value || "—"])]));
    const history = (detail.revisions || []).map(revision => `<details class="revision"><summary>第${revision.revisionNumber}版 / ${escapeHtml(revision.editType || "提出")} / ${escapeHtml(revision.submittedAt || "")}${revision.current ? "（最新版）" : ""}${revision.returnReason ? " / 差戻しあり" : ""}</summary>${detailList([["編集者", revision.editorName || "—"], ...(revision.returnReason ? [["差戻し理由", revision.returnReason], ["差戻し日時", revision.returnedAt || "—"]] : []), ...revision.answers.map(answer => [`${answer.categoryName} / ${answer.name}`, answer.type === "number" ? `${answer.value}件` : answer.value || "—"])] )}</details>`).join("");
    $("detailBody").innerHTML = current + (history ? `<h3>修正履歴</h3>${history}` : "");
  }
  $("detailDialog").showModal();
}

function renderCaseMappings() {
  const templates = data.templates || [];
  $("caseMappingRows").innerHTML = (data.caseMappings || []).map(mapping => `<tr data-case-mapping="${escapeAttribute(mapping.planId)}"><td>${compactValues(mapping.workDates, "予定なし")}</td><td>${compactValues(mapping.people, "未割当")}</td><td><strong>${escapeHtml(mapping.planName || "—")}</strong><br><small>${escapeHtml(mapping.planId)}</small></td><td><select data-field="templateId">${templates.map(template => `<option value="${escapeAttribute(template.templateId)}" ${template.templateId === mapping.templateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}</select></td><td><input data-field="mappingActive" type="checkbox" ${mapping.active ? "checked" : ""}></td><td><button type="button" data-save-mapping="${escapeAttribute(mapping.planId)}">保存</button></td></tr>`).join("") || '<tr><td colspan="6">稼働予定から選べる案件がありません。</td></tr>';
  document.querySelectorAll("[data-save-mapping]").forEach(button => button.addEventListener("click", () => saveCaseMapping(button.dataset.saveMapping)));
}

async function saveCaseMapping(planId) {
  const mapping = (data.caseMappings || []).find(item => item.planId === planId);
  const row = document.querySelector(`[data-case-mapping="${cssEscape(planId)}"]`);
  if (!mapping || !row) return;
  message("対象案件を保存しています…", false, true);
  try {
    await attendanceRequest("saveWorkReportCaseMapping", { planId, planName: mapping.planName, templateId: field(row, "templateId").value, active: field(row, "mappingActive").checked });
    message("対象案件を保存しました。");
    await load();
  } catch (error) { message(error.message, true); }
}

function openReturn(reportId) {
  returningReportId = reportId;
  $("returnReason").value = "";
  $("returnDialog").showModal();
}

async function submitReturn(event) {
  event.preventDefault();
  message("差戻しを保存しています…", false, true);
  try {
    await attendanceRequest("returnWorkReport", { reportId: returningReportId, reason: $("returnReason").value.trim() });
    $("returnDialog").close();
    message("実績報告を差し戻しました。本人の提出内容は履歴に残っています。");
    await load();
  } catch (error) { message(error.message, true); }
}

async function downloadCsv(includeHistory) {
  message(includeHistory ? "監査用履歴CSVを準備しています…" : "集計CSVを準備しています…", false, true);
  try {
    const result = await attendanceRequest("exportWorkReportsCsv", { ...filterPayload(), includeHistory });
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    message(includeHistory ? "監査用履歴CSVを出力しました。" : "集計CSVを出力しました。");
  } catch (error) {
    message(error.message, true);
  }
}

function setInitialDates() {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  $("dateFrom").value = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split("-").map(Number);
  $("dateTo").value = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(year, month, 0));
}
function field(row, name) { return row.querySelector(`[data-field="${name}"]`); }
function summaryCard(label, value) { return `<article><small>${escapeHtml(label)}</small><strong>${Number(value).toLocaleString("ja-JP")}</strong></article>`; }
function detailList(rows) { return `<dl class="detail-grid">${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`; }
function message(value, error = false, loading = false) { setActivity($("message"), loading, value); $("message").classList.toggle("error", error); }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^A-Za-z0-9_-]/g, "\\$&"); }
function compactValues(values, emptyLabel) { const items = Array.isArray(values) ? values : []; if (!items.length) return escapeHtml(emptyLabel); const shown = items.slice(0, 3).map(escapeHtml).join("<br>"); return shown + (items.length > 3 ? `<br><small>ほか${items.length - 3}件</small>` : ""); }
