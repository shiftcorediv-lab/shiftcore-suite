import {
  userNameBox,
  employeeCodeBox,
  accountMetaArea,
  entryBannerArea,
  messageBox,
  goSignupAdminBtn,
  portalHint
} from "./dom.js";

const ROLE_LABELS = { member: "メンバー", admin: "管理者", developer: "開発管理者", partner_individual: "アライアンス個人", partner_company_admin: "アライアンス法人 管理者" };
const WORK_STATUS_LABELS = { on: "稼働対象", off: "稼働対象外", active: "稼働対象", inactive: "稼働対象外" };

export function setInfoBox(target, text, type = "") {
  target.textContent = text;
  target.className = "info-box";
  if (type) target.classList.add(type);
}

export function showMessage(text, type = "") {
  messageBox.textContent = text;
  messageBox.className = "message";
  if (type) messageBox.classList.add(type);
}

export function renderAccountInfo(currentUser) {
  setInfoBox(
    userNameBox,
    currentUser.displayName || "ユーザー情報を取得できませんでした",
    currentUser.displayName ? "success" : "error"
  );

  setInfoBox(
    employeeCodeBox,
    currentUser.employeeCode || "アカウントコードを取得できませんでした",
    currentUser.employeeCode ? "success" : "error"
  );

  accountMetaArea.innerHTML = "";

  const roleBadge = document.createElement("span");
  roleBadge.className = "badge";
  roleBadge.textContent = "アカウント種別：" + (ROLE_LABELS[String(currentUser.role || "").toLowerCase()] || "未設定");

  const workStatusBadge = document.createElement("span");
  workStatusBadge.className = "badge";
  workStatusBadge.textContent = "稼働対象状態：" + (WORK_STATUS_LABELS[String(currentUser.workStatus || "").toLowerCase()] || "未設定");

  accountMetaArea.appendChild(roleBadge);
  accountMetaArea.appendChild(workStatusBadge);
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
  const titleLine = document.createElement("div");
  const titleStrong = document.createElement("strong");
  titleStrong.textContent = "Another Portalから移動しました";
  titleLine.appendChild(titleStrong);

  const moduleLine = document.createElement("div");
  moduleLine.textContent = "メンバー管理を表示しています。";

  banner.appendChild(titleLine);
  banner.appendChild(moduleLine);
  entryBannerArea.appendChild(banner);
}

export function updatePortalState(canUse) {
  goSignupAdminBtn.disabled = !canUse;
  portalHint.textContent = canUse
    ? "登録申請管理へ進めます。"
    : "このアカウントには利用権限がありません。";
}
