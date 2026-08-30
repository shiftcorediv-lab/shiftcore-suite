import { auth, onAuthStateChanged } from "../dashboard/auth.js";
import { attendanceRequest } from "../dashboard/attendance-api.js";

const context = JSON.parse(sessionStorage.getItem("shiftcore_report_context") || "null");
const $ = id => document.getElementById(id);
let formData = null;
let loadingStarted = false;

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
    renderContext(formData.record);
    if (formData.submitted) {
      $("loadingState").textContent = "この勤怠記録の実績報告は提出済みです。";
      sessionStorage.removeItem("shiftcore_report_context");
      return;
    }
    renderFields(formData.items || []);
    $("loadingState").hidden = true;
    $("reportForm").hidden = false;
  } catch (error) {
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
  if (item.type === "number") return `<label for="${id}">${escapeHtml(item.name)}${mark}<input id="${id}" data-item-id="${escapeAttribute(item.itemId)}" data-item-type="number" type="number" min="0" step="1" inputmode="numeric" placeholder="0"${required}></label>`;
  return `<label for="${id}">${escapeHtml(item.name)}${mark}<textarea id="${id}" data-item-id="${escapeAttribute(item.itemId)}" data-item-type="text" maxlength="5000"${required}></textarea></label>`;
}

$("reportForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!formData) return;
  $("submitBtn").disabled = true;
  setMessage("送信しています…");
  try {
    const answers = Array.from(document.querySelectorAll("[data-item-id]")).map(input => ({
      itemId: input.dataset.itemId,
      value: input.dataset.itemType === "number" && input.value.trim() === "" ? null : input.value
    }));
    const result = await attendanceRequest("submitReport", { recordId: formData.record.recordId, answers });
    sessionStorage.removeItem("shiftcore_report_context");
    setMessage(result.duplicate ? "この実績報告は提出済みです。" : "実績報告を送信しました。");
    setTimeout(() => location.replace("./dashboard.html"), 900);
  } catch (error) {
    setMessage(`${error.message} 入力内容は画面に残っています。通信結果が不明な場合も、同じ勤怠記録へ安全に再送できます。`, true);
    $("submitBtn").disabled = false;
  }
});

function setMessage(value, error = false) {
  $("message").textContent = value;
  $("message").classList.toggle("error", error);
}
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}
function escapeAttribute(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
}
