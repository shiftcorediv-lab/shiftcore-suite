// ===== ShiftBuilder main.js ここから =====

import { DASHBOARD_URL } from "./config.js";
import { requireShiftBuilderSession, getLoginUrl } from "./auth.js";
import {
  pingShiftBuilderApi,
  getCurrentShiftBuilderUser
} from "./api.js";
import { mockShiftData } from "./mock-data.js";
import { escapeHtml, getCurrentMonthValue } from "./utils.js";
import { getPermissionLabel, canEdit } from "./permissions.js";
import { renderSummary } from "./render-summary.js";
import { renderShiftTable } from "./render-shift-table.js";
import {
  renderSelectedCell,
  resetDetailPanel
} from "./render-detail-panel.js";
import {
  setCurrentSession,
  setCurrentUser,
  setCurrentShiftData,
  getCurrentShiftData,
  setSelectedCell,
  resetSelectedCell
} from "./state.js";

const dashboardBtn = document.getElementById("dashboardBtn");
const reloadBtn = document.getElementById("reloadBtn");
const loadShiftDataBtn = document.getElementById("loadShiftDataBtn");

const operatorText = document.getElementById("operatorText");
const permissionText = document.getElementById("permissionText");
const permissionBadge = document.getElementById("permissionBadge");

const apiStatusText = document.getElementById("apiStatusText");
const userNameText = document.getElementById("userNameText");
const shiftPermissionText = document.getElementById("shiftPermissionText");
const editPermissionText = document.getElementById("editPermissionText");

const targetMonthInput = document.getElementById("targetMonthInput");
const areaSelect = document.getElementById("areaSelect");

const requiredTotalText = document.getElementById("requiredTotalText");
const assignedTotalText = document.getElementById("assignedTotalText");
const shortageTotalText = document.getElementById("shortageTotalText");
const completionRateText = document.getElementById("completionRateText");
const unassignedCellText = document.getElementById("unassignedCellText");
const overCellText = document.getElementById("overCellText");

const shiftTableHead = document.getElementById("shiftTableHead");
const shiftTableBody = document.getElementById("shiftTableBody");

const selectedCellTitle = document.getElementById("selectedCellTitle");
const selectedCellSummary = document.getElementById("selectedCellSummary");
const assignedMembersList = document.getElementById("assignedMembersList");
const candidateList = document.getElementById("candidateList");

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
      <div class="loading-text">${escapeHtml(message)}</div>
    </div>
  `;
  document.body.appendChild(overlay);
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

function normalizeCurrentUser(currentUserResult) {
  return currentUserResult.user || currentUserResult.currentUser || currentUserResult;
}

function renderUser(currentUserResult) {
  const user = normalizeCurrentUser(currentUserResult);

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

function initializeFilters() {
  if (targetMonthInput && !targetMonthInput.value) {
    targetMonthInput.value = mockShiftData.month || getCurrentMonthValue();
  }
}

function findShiftCell(caseId, date) {
  const shiftData = getCurrentShiftData();

  if (!shiftData) return null;

  const caseItem = shiftData.cases.find((item) => item.caseId === caseId);
  const dateItem = shiftData.dates.find((item) => item.date === date);

  if (!caseItem || !dateItem) return null;

  const cell = caseItem.cells[date] || {
    required: 0,
    assigned: [],
    candidates: []
  };

  return {
    caseItem,
    dateItem,
    cell
  };
}

function selectShiftCell(caseId, date) {
  const found = findShiftCell(caseId, date);

  if (!found) {
    setStatus("選択したセル情報を取得できませんでした。");
    return;
  }

  setSelectedCell(found);

  renderSelectedCell(found, {
    selectedCellTitle,
    selectedCellSummary,
    assignedMembersList,
    candidateList
  });

  setStatus(`セルを選択しました：${found.caseItem.title} ${found.dateItem.label}`);
}

function loadMockShiftData() {
  const selectedArea = areaSelect?.value || "all";
  const selectedMonth = targetMonthInput?.value || mockShiftData.month;

  const shiftData = {
    ...mockShiftData,
    month: selectedMonth,
    area: selectedArea
  };

setCurrentShiftData(shiftData);

 renderSummary(ShiftData, {
  requiredTotalText,
  assignedTotalText,
  shortageTotalText,
  completionRateText,
  unassignedCellText,
  overCellText
});
  
  renderShiftTable(
  ShiftData,
  {
    shiftTableHead,
    shiftTableBody
  },
  {
    onSelectCell: selectShiftCell
  }
);

    resetSelectedCell();

  resetDetailPanel({
    selectedCellTitle,
    selectedCellSummary,
    assignedMembersList,
    candidateList
  });
  setStatus("仮データのシフト表を表示しました。次の段階でGAS APIから実データを取得します。");
}

async function init() {
  try {
    initializeFilters();

    setLoading(true, "ログイン状態を確認中...");
    setStatus("ログイン状態を確認中...");

    const session = await requireShiftBuilderSession();

    setCurrentSession(session);

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
    const currentUserResult = await getCurrentShiftBuilderUser(session.idToken);

    setCurrentUser(normalizeCurrentUser(currentUserResult));

    console.log("[ShiftBuilder] current user:", currentUserResult);

    renderUser(currentUserResult);
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

loadShiftDataBtn?.addEventListener("click", () => {
  loadMockShiftData();
});

init();

// ===== ShiftBuilder main.js ここまで =====
