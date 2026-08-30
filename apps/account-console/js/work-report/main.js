import { auth, onAuthStateChanged } from "../dashboard/auth.js";
import { attendanceRequest } from "../dashboard/attendance-api.js";
import { setActivity } from "../common/activity.js?v=20260831-activity-1";

const context = JSON.parse(sessionStorage.getItem("shiftcore_report_context") || "null");
const $ = id => document.getElementById(id);
let formData = null;
let loadingStarted = false;
let submissionToken = createSubmissionToken();
let pendingAnswers = null;
let submitting = false;

if (!context?.recordId) location.replace("./dashboard.html");

onAuthStateChanged(auth, user => {
  if (!user) return location.replace("./index.html");
  if (!loadingStarted) {
    loadingStarted = true;
    loadForm();
  }
});

async function loadForm() {
  try {
    formData = await attendanceRequest("getWorkReportForm", { recordId: context.recordId });
    if (formData.resumeSubmissionToken) submissionToken = formData.resumeSubmissionToken;
    renderContext(formData.record);
    renderFields(formData.items || []);
    renderRevisionNotice(formData);
    $("submitBtn").textContent = formData.revisionNumber ? "修正内容を保存" : "実績報告を送信";
    setActivity($("loadingState"), false);
    $("loadingState").hidden = true;
    $("reportForm").hidden = false;
  } catch (error) {
    setActivity($("loadingState"), false);
    $("loadingState").textContent = error.message;
    $("loadingState").classList.add("error");
  }
}

function renderContext(record) {
  const values = [
    ["稼働案件名", record.planName || "予定外稼働"],
    ["氏名（フルネーム）", record.reporterName || "—"],
    ["店舗名", record.storeName || "—"],
    ["入店日", record.workDate || "—"]
  ];
  $("reportContext").innerHTML = values.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  $("reportContext").hidden = false;
}

function renderFields(items) {
  const categories = [];
  items.forEach(item => {
    let category = categories.find(group => group.id === item.categoryId);
    if (!category) {
      category = { id: item.categoryId, name: item.categoryName, items: [] };
      categories.push(category);
    }
    category.items.push(item);
  });
  $("reportFields").innerHTML = categories.map((category, index) => `
    <details class="category" ${index === 0 || category.id === "qualitative" ? "open" : ""}>
      <summary>${escapeHtml(category.name)}</summary>
      <div class="category-body">
        ${category.items.some(item => item.type === "number") ? '<p class="category-help">件数を入力してください。空欄は0件として扱います。</p>' : ""}
        ${category.items.map(renderField).join("")}
      </div>
    </details>
  `).join("");
}

function renderField(item) {
  const id = `report-item-${escapeAttribute(item.itemId)}`;
  const required = item.required ? " required" : "";
  const mark = item.required ? '<span class="required-mark">*</span>' : "";
  const retired = item.retired ? '<small class="retired-mark">現在は停止中の項目です。過去報告の意味を保つため、この修正画面では引き続き表示します。</small>' : "";
  if (item.type === "number") return `<label for="${id}">${escapeHtml(item.name)}${mark}${retired}<input id="${id}" data-item-id="${escapeAttribute(item.itemId)}" data-item-type="number" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${item.value === "" ? "" : escapeAttribute(item.value)}"${required}></label>`;
  return `<label for="${id}">${escapeHtml(item.name)}${mark}${retired}<textarea id="${id}" data-item-id="${escapeAttribute(item.itemId)}" data-item-type="text" maxlength="5000"${required}>${escapeHtml(item.value || "")}</textarea></label>`;
}

function renderRevisionNotice(data) {
  if (data.resuming) {
    $("revisionNotice").innerHTML = "<strong>前回の送信を復元しました</strong><p>保存できていた回答を表示しています。内容を確認して、もう一度送信してください。</p>";
    $("revisionNotice").hidden = false;
    return;
  }
  if (!data.revisionNumber) return;
  const returned = data.status === "差戻し中";
  $("revisionNotice").innerHTML = `<strong>${returned ? "修正をお願いします" : `提出済み・第${data.revisionNumber}版`}</strong><p>${returned ? escapeHtml(data.returnReason || "管理者から修正依頼があります。") : "保存すると新しい版になり、現在の入力内容が画面上の最新版になります。以前の版も履歴として残ります。"}</p>`;
  $("revisionNotice").classList.toggle("returned", returned);
  $("revisionNotice").hidden = false;
}

$("reportForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!formData) return;
  pendingAnswers = collectAnswers();
  renderConfirmation(pendingAnswers);
  setConfirmMessage("");
  $("reportConfirmDialog").showModal();
});

$("editReportBtn").addEventListener("click", () => {
  if (!submitting) $("reportConfirmDialog").close();
});
$("reportConfirmDialog").addEventListener("cancel", event => {
  if (submitting) event.preventDefault();
});

$("confirmSubmitBtn").addEventListener("click", submitConfirmedReport);
$("dashboardBtn").addEventListener("click", () => location.replace("./dashboard.html"));

function collectAnswers() {
  return Array.from(document.querySelectorAll("[data-item-id]")).map(input => ({
    itemId: input.dataset.itemId,
    value: input.dataset.itemType === "number" && input.value.trim() === "" ? null : input.value
  }));
}

function renderConfirmation(answers) {
  const record = formData.record || {};
  const contextValues = [
    ["氏名", record.reporterName || "—"],
    ["稼働案件名", record.planName || "予定外稼働"],
    ["店舗名", record.storeName || "—"],
    ["入店日", record.workDate || "—"]
  ];
  $("confirmContext").innerHTML = `<dl>${contextValues.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;

  const answerById = new Map(answers.map(answer => [String(answer.itemId), answer.value]));
  const categories = [];
  (formData.items || []).forEach(item => {
    let category = categories.find(group => group.id === item.categoryId);
    if (!category) {
      category = { id: item.categoryId, name: item.categoryName, items: [] };
      categories.push(category);
    }
    category.items.push(item);
  });
  $("confirmAnswers").innerHTML = categories.map(category => renderConfirmationCategory(category, answerById)).join("");
}

function renderConfirmationCategory(category, answerById) {
  const entered = [];
  const defaulted = [];
  let meaningful = false;
  category.items.forEach(item => {
    const value = answerById.get(String(item.itemId));
    if (item.type === "number" && value === null) {
      defaulted.push(item.name);
      return;
    }
    const text = String(value ?? "").trim();
    if (item.type === "number") {
      if (Number(text) !== 0) meaningful = true;
      entered.push([item.name, `${text || "0"}件`]);
      return;
    }
    if (text) meaningful = true;
    entered.push([item.name, text || "未入力"]);
  });
  const summary = [entered.length ? `${entered.length}項目を確認` : "", defaulted.length ? `未入力→0件 ${defaulted.length}項目` : ""].filter(Boolean).join("・");
  return `<details class="confirm-category" ${meaningful ? "open" : ""}>
    <summary><span>${escapeHtml(category.name)}</span><small>${escapeHtml(summary)}</small></summary>
    <div class="confirm-category-body">
      ${entered.length ? `<dl>${entered.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
      ${defaulted.length ? `<details class="defaulted-items"><summary>0件として保存する未入力項目</summary><p>${defaulted.map(name => escapeHtml(name)).join("、")}</p></details>` : ""}
    </div>
  </details>`;
}

async function submitConfirmedReport() {
  if (!formData || !pendingAnswers || submitting) return;
  submitting = true;
  $("submitBtn").disabled = true;
  $("editReportBtn").disabled = true;
  $("confirmSubmitBtn").disabled = true;
  setConfirmMessage("送信しています…", false, true);
  try {
    const answers = pendingAnswers;
    const result = await attendanceRequest("submitReport", { recordId: formData.record.recordId, answers, submissionToken });
    sessionStorage.removeItem("shiftcore_report_context");
    $("reportConfirmDialog").close();
    renderCompletion(result);
  } catch (error) {
    setConfirmMessage(`${error.message} 入力内容は画面に残っています。通信結果が不明な場合も、同じ勤怠記録へ安全に再送できます。`, true);
    $("submitBtn").disabled = false;
    $("editReportBtn").disabled = false;
    $("confirmSubmitBtn").disabled = false;
  } finally {
    submitting = false;
  }
}

function renderCompletion(result) {
  const name = formData.record?.reporterName || "稼働者";
  $("reportForm").hidden = true;
  $("reportContext").hidden = true;
  $("revisionNotice").hidden = true;
  $("completionTitle").textContent = `${name}さん、今日もお疲れさまでした`;
  $("completionMessage").textContent = "本日の稼働と、丁寧な実績報告をありがとうございます。ゆっくり休んでください。";
  $("completionDetail").textContent = result.duplicate ? "同じ内容はすでに安全に保存されています。" : `実績報告を第${result.revisionNumber}版として受け付けました。`;
  $("completionState").hidden = false;
  $("completionState").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setConfirmMessage(value, error = false, loading = false) {
  setActivity($("confirmMessage"), loading, value);
  $("confirmMessage").classList.toggle("error", error);
}
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}
function escapeAttribute(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
}
function createSubmissionToken() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `report-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
