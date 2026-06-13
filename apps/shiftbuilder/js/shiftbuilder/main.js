// ===== ShiftBuilder main.js ここから =====

import { DASHBOARD_URL } from "./config.js";
import { requireShiftBuilderSession, getLoginUrl } from "./auth.js";
import {
  pingShiftBuilderApi,
  getCurrentShiftBuilderUser
} from "./api.js";

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

function setStatus(message) {
  if (statusBox) {
    statusBox.textContent = message;
  }
}

function setLoading(isLoading, message = "処理中...") {
  const existing = document.getElementById("shiftbuilderLoadingOverlay");

  if (!isLoading) {
    if (existing) existing.remove();
    return;
  }

  if (existing) {
    const text = existing.querySelector(".loading-text");
    if (text) text.textContent = message;
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "shiftbuilderLoadingOverlay";
  overlay.className = "loading-overlay";
  overlay.innerHTML = `
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function getPermissionLabel(permission) {
  const labels = {
    all: "全管理",
    manager: "確定・公開管理",
    edit: "作成・編集",
    view: "閲覧のみ",
    self: "自分の予定のみ"
  };

  return labels[permission] || "権限なし";
}

function canEdit(permission) {
  return ["all", "manager", "edit"].includes(permission);
}

function renderNoLogin(session) {
  operatorText.textContent = "未ログイン";
  permissionText.textContent = "ShiftBuilderを利用するにはログインが必要です";
  permissionBadge.textContent = "未ログイン";

  apiStatusText.textContent = "未実行";
  userNameText.textContent = "-";
  shiftPermissionText.textContent = "-";
  editPermissionText.textContent = "-";

  setStatus(
    `未ログインです。Dashboardからログイン後、再度ShiftBuilderを開いてください。ログインURL: ${getLoginUrl()} / email: ${session.email || "-"} / uid: ${session.uid || "-"}`
  );
}

function renderUser(currentUser) {
  const user = currentUser.user || currentUser.currentUser || currentUser;

  const displayName =
    user.name ||
    user.display_name ||
    user.email ||
    "名前未設定";

  const permission =
    user.shiftbuilder_permission ||
    user.shiftBuilderPermission ||
    "";

  const permissionLabel = getPermissionLabel(permission);
  const editable = canEdit(permission);

  operatorText.textContent = displayName;
  permissionText.textContent = `ShiftBuilder権限：${permissionLabel}`;
  permissionBadge.textContent = permissionLabel;

  userNameText.textContent = displayName;
  shiftPermissionText.textContent = permissionLabel;
  editPermissionText.textContent = editable ? "編集可" : "閲覧のみ";

  setStatus(
    editable
      ? "ShiftBuilderを利用できます。現在は開発中トップ画面です。"
      : "ShiftBuilderを閲覧できます。編集権限はありません。"
  );
}

async function init() {
  try {
    setLoading(true, "ログイン状態を確認中...");
    setStatus("ログイン状態を確認中...");

    const session = await requireShiftBuilderSession();

    console.log("[ShiftBuilder] auth session:", session);

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      return;
    }

    setStatus(`Firebaseログイン確認OK：${session.email}`);

    setLoading(true, "ShiftBuilder APIを確認中...");
    const pingResult = await pingShiftBuilderApi();

    console.log("[ShiftBuilder] ping result:", pingResult);

    apiStatusText.textContent = "接続OK";

    setLoading(true, "ShiftBuilder権限を確認中...");
    const currentUser = await getCurrentShiftBuilderUser(session.idToken);

    console.log("[ShiftBuilder] current user:", currentUser);

    renderUser(currentUser);
  } catch (error) {
    console.error("[ShiftBuilder] init error:", error);

    operatorText.textContent = "確認エラー";
    permissionText.textContent = "ShiftBuilderの初期化中にエラーが発生しました";
    permissionBadge.textContent = "エラー";

    apiStatusText.textContent = "エラー";

    setStatus(error.message || String(error));
  } finally {
    setLoading(false);
  }
}

dashboardBtn?.addEventListener("click", () => {
  window.location.href = DASHBOARD_URL;
});

reloadBtn?.addEventListener("click", () => {
  window.location.reload();
});

init();

// ===== ShiftBuilder main.js ここまで =====
