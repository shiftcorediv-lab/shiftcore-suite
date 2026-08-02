import {
  userNameBox,
  employeeCodeBox,
  developerMetaArea,
  messageBox,
  goManageBtn,
  manageHint
} from "./dom.js";

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
    currentUser.employeeCode || "社員コードを取得できませんでした",
    currentUser.employeeCode ? "success" : "error"
  );

  setInfoBox(
    roleBox,
    currentUser.role || "未設定",
    currentUser.role ? "success" : "error"
  );
}
export function renderDeveloperMeta(params, currentUser) {
  const role = String(currentUser?.role || "").trim().toLowerCase();

  if (role !== "developer") {
    developerMetaArea.style.display = "none";
    developerMetaArea.textContent = "";
    return;
  }

  const moduleName = params?.module || "unknown";
  const workStatus = currentUser?.workStatus || "未設定";

  developerMetaArea.style.display = "block";
  developerMetaArea.textContent = "";

  const inner = document.createElement("div");
  inner.className = "developer-meta-inner";

  const moduleSpan = document.createElement("span");
  moduleSpan.textContent = "ShiftCore > " + moduleName;

  const roleSpan = document.createElement("span");
  roleSpan.textContent = "role: " + role;

  const workStatusSpan = document.createElement("span");
  workStatusSpan.textContent = "workStatus: " + workStatus;

  inner.appendChild(moduleSpan);
  inner.appendChild(roleSpan);
  inner.appendChild(workStatusSpan);

  developerMetaArea.appendChild(inner);
}

export function updateManageButtonState(canManage) {
  goManageBtn.disabled = !canManage;
  manageHint.textContent = canManage
    ? "管理画面へ進めます。"
    : "管理機能は管理対象ロールのみ利用できます。";
}
