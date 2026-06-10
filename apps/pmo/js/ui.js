import {
  userNameBox,
  employeeCodeBox,
  accountMetaArea,
  inactiveWarningArea,
  entryBannerArea,
  messageBox,
  completeText,
  completeDetail,
  mainFormArea,
  completeScreen
} from "./dom.js";
import { currentUser } from "./state.js";

export function showMessage(target, text, type = "") {
  target.textContent = text;
  target.className = "message";
  if (type) target.classList.add(type);
}

export function showMainMessage(text, type = "") {
  showMessage(messageBox, text, type);
}

export function setInfoBox(target, text, type = "") {
  target.textContent = text;
  target.className = "info-box";
  if (type) target.classList.add(type);
}

export function isUserInactive() {
  return currentUser.workStatus === "off";
}

export function renderAccountInfo() {
  setInfoBox(
    userNameBox,
    currentUser.displayName || "ユーザー情報を取得できませんでした",
    currentUser.displayName ? "success" : "error"
  );

  setInfoBox(
    employeeCodeBox,
    currentUser.employeeCode || "社員コードを取得できませんでした",
    currentUser.employeeCode ? "success" : "error"
  );

  accountMetaArea.innerHTML = "";

  const roleBadge = document.createElement("span");
  roleBadge.className = "badge";
  roleBadge.textContent = "role: " + (currentUser.role || "未設定");

  const workStatusBadge = document.createElement("span");
  workStatusBadge.className = "badge";
  workStatusBadge.textContent = "workStatus: " + (currentUser.workStatus || "未設定");

  accountMetaArea.appendChild(roleBadge);
  accountMetaArea.appendChild(workStatusBadge);

  inactiveWarningArea.style.display = isUserInactive() ? "block" : "none";
}

export function setupShiftCoreEntryBanner(params) {
  if ((params.from || "") !== "shiftcore") return;

  const banner = document.createElement("div");
  banner.style.margin = "0 auto 16px";
  banner.style.padding = "12px 14px";
  banner.style.borderRadius = "12px";
  banner.style.background = "#eef3ff";
  banner.style.border = "1px solid #cfdcff";
  banner.style.fontSize = "14px";
  banner.style.lineHeight = "1.6";
  banner.innerHTML = `
    <div><strong>ShiftCoreから移動しました</strong></div>
    <div>module: ${params.module || "unknown"}</div>
  `;
  entryBannerArea.appendChild(banner);
}

export function showCompleteScreen(payload) {
  const holidayText = payload.submitType === "希望休なし"
    ? "希望休なし"
    : (payload.offDates.length ? payload.offDates.join(", ") : "なし");

  completeText.textContent = payload.displayName + " さんの希望休提出が完了しました。";
  completeDetail.textContent =
    "【氏名】\n" + payload.displayName + "\n\n" +
    "【社員コード】\n" + payload.employeeCode + "\n\n" +
    "【対象年月】\n" + payload.targetYearMonth + "\n\n" +
    "【希望休】\n" + holidayText + "\n\n" +
    "【メモ】\n" + (payload.memo || "なし");

  mainFormArea.style.display = "none";
  completeScreen.style.display = "block";
  window.scrollTo(0, 0);
}

export function backToFormView() {
  completeScreen.style.display = "none";
  mainFormArea.style.display = "block";
  window.scrollTo(0, 0);
}
