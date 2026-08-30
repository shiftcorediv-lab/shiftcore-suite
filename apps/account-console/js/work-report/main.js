import { auth, onAuthStateChanged } from "../dashboard/auth.js";
import { attendanceRequest } from "../dashboard/attendance-api.js";

const context = JSON.parse(sessionStorage.getItem("shiftcore_report_context") || "null");
const $ = id => document.getElementById(id);
const performanceFields = [
  ["u39Mnp", "U39 MNP"], ["over40Mnp", "40 Over MNP"], ["u39New", "U39 純新規"], ["over40New", "40 Over 純新規"],
  ["smartphoneSales", "スマホ総販"], ["outsideSalesSmartphones", "内）販売外スマホ総販"],
  ["highEndAndroid", "内）ハイエンドAndroid"], ["highEndIphone", "内）ハイエンドiPhone"],
  ["usedSmartphones", "内）中古スマホ"], ["makerIncentiveHigh", "内）メーカーインセ（ハイエンド）"],
  ["makerIncentiveMiddle", "内）メーカーインセ（ミドル）"], ["docomoPoikatsuMax", "ドコモポイ活MAX移行"],
  ["docomoMax", "ドコモMAX移行"], ["dValuePass", "dバリューパス"],
  ["securityStandard", "あんしんセキュリティスタンダード（詐欺含む）"],
  ["amazonPrimeNew", "AmazonPrime（新規）"], ["amazonPrimeExisting", "AmazonPrime（既存）"],
  ["agekyun", "アゲキュン（Disney+、Netflix等）"], ["docomoHikari10g", "ドコモ光（10ギガ）"],
  ["docomoHikari1g", "ドコモ光（1ギガ）"], ["home5g", "Home 5g"],
  ["dCardPlatinum", "dカードPlatinum"], ["dCardGold", "dカードGOLD"], ["dCardGoldU", "dカードGOLD U"],
  ["docomoDenkiGreen", "ドコモでんき（Green）"], ["docomoDenkiBasic", "ドコモでんき（Basic）"],
  ["docomoGas", "ドコモガス"], ["securityService", "セキュリティサービス"], ["adBlock", "広告ブロック"],
  ["backupService", "バックアップサービス"], ["fraudCallProtection", "詐欺電話対策"],
  ["compensationService", "補償サービス"], ["coatingBoth", "コーティング（両面）"], ["coatingOne", "コーティング（片面）"]
];

if (!context) location.replace("./dashboard.html");

const plans = context?.plans?.length ? context.plans : [{ id: "", name: "当日の稼働案件" }];
$("planSelect").innerHTML = plans.map(plan => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)}</option>`).join("");
$("reporterName").value = context?.reporterName || "";
$("storeName").value = context?.storeName || plans[0]?.name || "";
$("entryDate").value = normalizeDate(context?.workDate);
$("performanceFields").innerHTML = performanceFields.map(([id, label]) =>
  `<label>${escapeHtml(label)}<input id="${id}" type="number" min="0" step="1" inputmode="numeric" placeholder="0"></label>`
).join("");

onAuthStateChanged(auth, user => { if (!user) location.replace("./index.html"); });

$("reportForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("submitBtn").disabled = true;
  try {
    const plan = plans.find(item => String(item.id) === String($("planSelect").value)) || plans[0];
    const basicLines = [
      `氏名：${$("reporterName").value.trim()}`,
      `店舗名：${$("storeName").value.trim()}`,
      `入店日：${$("entryDate").value}`,
      `応対数：${numberValue("responseCount")}件`
    ];
    const performanceLines = performanceFields.map(([id, label]) => `${label}：${numberValue(id)}件`);
    const result = [
      "【基本情報】", ...basicLines, "", "【実績集計】", ...performanceLines, "",
      "【定性報告】", `成果につながった行動：${$("successfulActions").value.trim()}`,
      `実施した対策と結果：${$("measuresAndResults").value.trim()}`
    ].join("\n");
    const notes = [
      `実績不振の理由：${$("underperformanceReason").value.trim() || "なし"}`,
      `役員への報告・申し送り：${$("executiveNotes").value.trim() || "なし"}`
    ].join("\n");
    await attendanceRequest("submitReport", { recordId: context.recordId, planId: plan.id, planName: plan.name, result, notes });
    sessionStorage.removeItem("shiftcore_report_context");
    $("message").textContent = "実績報告を送信しました。";
    setTimeout(() => location.replace("./dashboard.html"), 900);
  } catch (error) {
    $("message").textContent = error.message;
    $("submitBtn").disabled = false;
  }
});

function numberValue(id) {
  const value = Number($(id)?.value || 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
function normalizeDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}
