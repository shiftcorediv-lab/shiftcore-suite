import {
  userNameBox,
  employeeCodeBox,
  roleBox,
  developerMetaArea,
  messageBox,
  goManageBtn,
  manageHint
} from "./dom.js";

const ROLE_LABELS = { member: "メンバー", admin: "管理者", developer: "開発管理者", partner_individual: "アライアンス個人", partner_company_admin: "アライアンス法人 管理者" };

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

  setInfoBox(
    roleBox,
    ROLE_LABELS[String(currentUser.role || "").toLowerCase()] || "未設定",
    currentUser.role ? "success" : "error"
  );
}
export function renderDeveloperMeta(params, currentUser) {
  void params;
  void currentUser;
  developerMetaArea.style.display = "none";
  developerMetaArea.textContent = "";
}

export function updateManageButtonState(canManage) {
  goManageBtn.disabled = !canManage;
  manageHint.textContent = canManage
    ? "管理画面へ進めます。"
    : "管理機能は管理対象ロールのみ利用できます。";
}
