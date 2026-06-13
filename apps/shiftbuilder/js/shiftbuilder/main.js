// ===== ShiftBuilder main ここから =====

import { DASHBOARD_URL } from "./config.js";
import { requireShiftBuilderSession } from "./auth.js";
import {
  pingShiftBuilderApi,
  getCurrentShiftBuilderUser
} from "./api.js";


// ===== DOM取得ここから =====
const dashboardBtn = document.getElementById("dashboardBtn");
const reloadBtn = document.getElementById("reloadBtn");

const operatorText = document.getElementById("operatorText");
const permissionText = document.getElementById("permissionText");
const permissionBadge = document.getElementById("permissionBadge");

const apiStatusText = document.getElementById("apiStatusText");
const userNameText = document.getElementById("userNameText");
const shiftPermissionText = document.getElementById("shiftPermissionText");
const editPermissionText = document.getElementById("editPermissionText");

const statusBox = document.getElementById("statusBox");
// ===== DOM取得ここまで =====


// ===== 状態ここから =====
let session = null;
let idToken = "";
let currentUser = null;
// ===== 状態ここまで =====


// ===== 表示ラベルここから =====
const SHIFTBUILDER_PERMISSION_LABELS = {
  all: "全管理",
  manager: "確定・公開管理",
  edit: "作成・編集",
  view: "閲覧のみ",
  self: "自分の予定のみ"
};
// ===== 表示ラベルここまで =====


// ===== 共通表示ここから =====
function text(value) {
  return String(value == null ? "" : value).trim();
}

function setStatus(message) {
  statusBox.textContent = message;
}

function setPermissionBadge(label, type) {
  permissionBadge.textContent = label;
  permissionBadge.className = "badge";

  if (type === "ok") {
    permissionBadge.classList.add("ok");
  }

  if (type === "ng") {
    permissionBadge.classList.add("ng");
  }
}

function getShiftBuilderPermissionLabel(value) {
  const key = text(value);
  return SHIFTBUILDER_PERMISSION_LABELS[key] || "権限なし";
}

function showLoading(message = "読み込み中...") {
  let overlay = document.getElementById("shiftBuilderLoadingOverlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "shiftBuilderLoadingOverlay";
    overlay.className = "loading-overlay";
    overlay.innerHTML = `
      <div class="loading-card">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-text">読み込み中...</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const loadingText = overlay.querySelector(".loading-text");

  if (loadingText) {
    loadingText.textContent = message;
  }

  overlay.classList.add("show");
}

function hideLoading() {
  const overlay = document.getElementById("shiftBuilderLoadingOverlay");

  if (overlay) {
    overlay.classList.remove("show");
  }
}
// ===== 共通表示ここまで =====


// ===== 初期化ここから =====
async function init() {
  try {
    showLoading("ログイン状態を確認中...");
    setStatus("ログイン状態を確認中...");
    setPermissionBadge("確認中", "");

    session = await requireShiftBuilderSession();

    if (!session) {
      hideLoading();
      return;
    }

    idToken = session.idToken;

    showLoading("ShiftBuilder APIに接続中...");
    setStatus("ShiftBuilder APIに接続中...");

    const pingResult = await pingShiftBuilderApi();

    if (!isOkResult(pingResult)) {
      throw new Error(pingResult.message || "ShiftBuilder APIへの接続に失敗しました");
    }

    apiStatusText.textContent = "接続OK";

    showLoading("ShiftBuilder権限を確認中...");
    setStatus("ShiftBuilder権限を確認中...");

    const currentUserResult = await getCurrentShiftBuilderUser(idToken);

    if (!isOkResult(currentUserResult)) {
      setPermissionBadge("権限なし", "ng");
      operatorText.textContent = session.email || "-";
      permissionText.textContent = currentUserResult.message || "ShiftBuilderの利用権限がありません";
      apiStatusText.textContent = "認証NG";
      userNameText.textContent = "-";
      shiftPermissionText.textContent = "-";
      editPermissionText.textContent = "-";
      setStatus(currentUserResult.message || "ShiftBuilderの利用権限がありません");
      return;
    }

    currentUser = currentUserResult.user;

    renderCurrentUser(currentUser, currentUserResult);

    setStatus("ShiftBuilder認証確認が完了しました");

  } catch (error) {
    setPermissionBadge("エラー", "ng");
    apiStatusText.textContent = "エラー";
    setStatus("初期化エラー\n\n" + error.message);
  } finally {
    hideLoading();
  }
}

function isOkResult(result) {
  return result && (result.ok === true || result.success === true);
}

function renderCurrentUser(user, result) {
  const displayName = text(user.display_name || user.name || user.email);
  const email = text(user.email);
  const permissionLabel = getShiftBuilderPermissionLabel(user.shiftbuilder_permission);
  const canEdit = result.canEditShiftBuilder === true || user.can_edit_shiftbuilder === true;

  operatorText.textContent = `${displayName || "-"} / ${email || "-"}`;
  permissionText.textContent = `ShiftBuilder：${permissionLabel}`;
  setPermissionBadge("利用可", "ok");

  apiStatusText.textContent = "認証OK";
  userNameText.textContent = displayName || "-";
  shiftPermissionText.textContent = permissionLabel;
  editPermissionText.textContent = canEdit ? "編集可" : "閲覧のみ";
}
// ===== 初期化ここまで =====


// ===== イベントここから =====
dashboardBtn.addEventListener("click", () => {
  window.location.href = DASHBOARD_URL;
});

reloadBtn.addEventListener("click", () => {
  init();
});
// ===== イベントここまで =====


init();

// ===== ShiftBuilder main ここまで =====
