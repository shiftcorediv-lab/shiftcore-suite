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

let currentSession = null;
let currentUser = null;
let currentShiftData = null;
let selectedCell = null;


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

function getCellStatus(cell) {
  const required = Number(cell?.required || 0);
  const assignedCount = Array.isArray(cell?.assigned) ? cell.assigned.length : 0;

  if (required === 0 && assignedCount === 0) {
    return {
      key: "completed",
      label: "対象外",
      note: "必要枠なし"
    };
  }

  if (assignedCount === 0) {
    return {
      key: "unassigned",
      label: "未アサイン",
      note: `${assignedCount}/${required}`
    };
  }

  if (assignedCount < required) {
    return {
      key: "shortage",
      label: "不足",
      note: `${assignedCount}/${required}`
    };
  }

  if (assignedCount === required) {
    return {
      key: "completed",
      label: "アサイン完了",
      note: `${assignedCount}/${required}`
    };
  }

  return {
    key: "over",
    label: "超過",
    note: `${assignedCount}/${required}`
  };
}

function renderShiftTable(data) {
  shiftTableHead.innerHTML = `
    <tr>
      <th>案件</th>
      ${data.dates
        .map((dateItem) => {
          return `
            <th>
              <div>${escapeHtml(dateItem.label)}</div>
              <div class="table-weekday">${escapeHtml(dateItem.weekday)}</div>
            </th>
          `;
        })
        .join("")}
    </tr>
  `;

  shiftTableBody.innerHTML = data.cases
    .map((caseItem) => {
      const dateCells = data.dates
        .map((dateItem) => {
          const cell = caseItem.cells[dateItem.date] || {
            required: 0,
            assigned: [],
            candidates: []
          };
          const status = getCellStatus(cell);
          const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;
          const required = Number(cell.required || 0);

          return `
            <td>
              <button
                type="button"
                class="shift-cell shift-cell-${escapeHtml(status.key)}"
                data-case-id="${escapeHtml(caseItem.caseId)}"
                data-date="${escapeHtml(dateItem.date)}"
              >
                <span class="shift-cell-status">${escapeHtml(status.label)}</span>
                <span class="shift-cell-count">${assignedCount}/${required}</span>
                <span class="shift-cell-note">${escapeHtml(status.note)}</span>
              </button>
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          <td>
            <div class="case-title">${escapeHtml(caseItem.title)}</div>
            <div class="case-meta">${escapeHtml(caseItem.client)} / ${escapeHtml(caseItem.area)}</div>
            <div class="case-id">${escapeHtml(caseItem.caseId)}</div>
          </td>
          ${dateCells}
        </tr>
      `;
    })
    .join("");

  bindShiftCellEvents();
}

function bindShiftCellEvents() {
  const cells = document.querySelectorAll(".shift-cell");

  cells.forEach((cellButton) => {
    cellButton.addEventListener("click", () => {
      const caseId = cellButton.dataset.caseId;
      const date = cellButton.dataset.date;
      selectShiftCell(caseId, date);
    });
  });
}

function findShiftCell(caseId, date) {
  if (!currentShiftData) return null;

  const caseItem = currentShiftData.cases.find((item) => item.caseId === caseId);
  const dateItem = currentShiftData.dates.find((item) => item.date === date);

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

  selectedCell = found;
  renderSelectedCell(found);
}

function renderSelectedCell(found) {
  const { caseItem, dateItem, cell } = found;
  const status = getCellStatus(cell);
  const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;
  const required = Number(cell.required || 0);

  selectedCellTitle.textContent = `${caseItem.title} / ${dateItem.label}(${dateItem.weekday})`;
  selectedCellSummary.textContent =
    `${caseItem.client} / ${caseItem.area} / 状態：${status.label} / ${assignedCount}/${required}`;

  renderAssignedMembers(cell.assigned || []);
  renderCandidates(cell.candidates || []);

  setStatus(`セルを選択しました：${caseItem.title} ${dateItem.label}`);
}

function renderAssignedMembers(members) {
  if (!members.length) {
    assignedMembersList.innerHTML = `<div class="empty-note">アサイン済メンバーはいません。</div>`;
    return;
  }

  assignedMembersList.innerHTML = members
    .map((member) => {
      return `
        <div class="member-item">
          <div class="member-name">${escapeHtml(member.name)}</div>
          <div class="member-meta">${escapeHtml(member.note || "メモなし")}</div>
        </div>
      `;
    })
    .join("");
}

function renderCandidates(candidates) {
  if (!candidates.length) {
    candidateList.innerHTML = `<div class="empty-note">候補者はいません。</div>`;
    return;
  }

  candidateList.innerHTML = candidates
    .map((candidate) => {
      const groupClass = getCandidateGroupClass(candidate.group);

      return `
        <div class="candidate-item ${groupClass}">
          <div class="candidate-name">${escapeHtml(candidate.name)}</div>
          <div class="candidate-meta">${escapeHtml(candidate.group)} / ${escapeHtml(candidate.reason || "理由なし")}</div>
        </div>
      `;
    })
    .join("");
}

function getCandidateGroupClass(group) {
  if (group === "追加できる候補") return "candidate-available";
  if (group === "注意あり候補") return "candidate-warning";
  if (group === "追加不可") return "candidate-unavailable";
  return "";
}

function loadMockShiftData() {
  const selectedArea = areaSelect?.value || "all";
  const selectedMonth = targetMonthInput?.value || mockShiftData.month;

  currentShiftData = {
    ...mockShiftData,
    month: selectedMonth,
    area: selectedArea
  };

 renderSummary(currentShiftData, {
  requiredTotalText,
  assignedTotalText,
  shortageTotalText,
  completionRateText,
  unassignedCellText,
  overCellText
});
  
  renderShiftTable(currentShiftData);

  selectedCell = null;
  selectedCellTitle.textContent = "未選択";
  selectedCellSummary.textContent =
    "案件×日付セルを選択すると、候補者やアサイン状況をここに表示します。";
  assignedMembersList.innerHTML = `<div class="empty-note">未選択</div>`;
  candidateList.innerHTML = `<div class="empty-note">未選択</div>`;

  setStatus("仮データのシフト表を表示しました。次の段階でGAS APIから実データを取得します。");
}

async function init() {
  try {
    initializeFilters();

    setLoading(true, "ログイン状態を確認中...");
    setStatus("ログイン状態を確認中...");

    const session = await requireShiftBuilderSession();

    currentSession = session;

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

    currentUser = normalizeCurrentUser(currentUserResult);

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
