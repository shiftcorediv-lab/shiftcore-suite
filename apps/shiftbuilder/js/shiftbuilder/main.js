// ===== ShiftBuilder main.js ここから =====

import { DASHBOARD_URL } from "./config.js";
import { requireShiftBuilderSession, getLoginUrl } from "./auth.js";
import {
  pingShiftBuilderApi,
  getCurrentShiftBuilderUser,
  getShiftBuilderMonthData,
  createShiftBuilderAssignment,
  archiveShiftBuilderAssignment,
  getShiftBuilderAssignmentCandidates
} from "./api.js";
import { mockShiftData } from "./mock-data.js";
import { escapeHtml } from "./utils.js";
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
  getCurrentSession,
  getSelectedCell,
  setSelectedCell,
  resetSelectedCell
} from "./state.js";
import { elements } from "./dom.js";

let assignmentCandidates = [];

function setStatus(message) {
  if (elements.statusBox) {
    elements.statusBox.textContent = message;
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

function getNextMonthValue() {
  const date = new Date();

  date.setMonth(date.getMonth() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function renderNoLogin(session) {
  elements.operatorText.textContent = "未ログイン";
  elements.permissionText.textContent = "ShiftBuilderを利用するにはログインが必要です";
  elements.permissionBadge.textContent = "未ログイン";

  elements.apiStatusText.textContent = "未実行";
  elements.userNameText.textContent = "-";
  elements.shiftPermissionText.textContent = "-";
  elements.editPermissionText.textContent = "-";

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

  elements.operatorText.textContent = displayName;
  elements.permissionText.textContent = `ShiftBuilder権限：${permissionLabel}`;
  elements.permissionBadge.textContent = permissionLabel;

  elements.userNameText.textContent = displayName;
  elements.shiftPermissionText.textContent = permissionLabel;
  elements.editPermissionText.textContent = editable ? "編集可" : "閲覧のみ";

  setStatus(
    editable
      ? "ShiftBuilderを利用できます。翌月シフトを自動表示します。"
      : "ShiftBuilderを閲覧できます。編集権限はありません。"
  );
}

function initializeFilters() {
  if (elements.targetMonthInput && !elements.targetMonthInput.value) {
    elements.targetMonthInput.value = getNextMonthValue();
  }
}

function renderAssignmentCandidateCards() {
  if (!elements.assignmentCandidateList) {
    return;
  }

  const selectedCell = getSelectedCell();

  if (!selectedCell) {
    elements.assignmentCandidateList.innerHTML = `<div class="empty-note">セル未選択</div>`;
    return;
  }

  const { cell } = selectedCell;

  if (Number(cell.required || 0) <= 0) {
    elements.assignmentCandidateList.innerHTML = `<div class="empty-note">必要枠のないセルです</div>`;
    return;
  }

  if (!assignmentCandidates.length) {
    elements.assignmentCandidateList.innerHTML = `<div class="empty-note">候補者がいません</div>`;
    return;
  }

  const assignedUserIds = Array.isArray(cell.assigned)
    ? cell.assigned.map((member) => String(member.internal_user_id || ""))
    : [];

  elements.assignmentCandidateList.innerHTML = assignmentCandidates.map((candidate) => {
    const userId = candidate.internal_user_id || "";
    const displayName =
      candidate.display_name ||
      candidate.displayName ||
      candidate.name ||
      userId ||
      "氏名未設定";

    const accountCode =
      candidate.account_code ||
      candidate.employee_code ||
      "";

    const personType = candidate.person_type || "区分未設定";
    const contractType = candidate.contract_type || "契約未設定";
    const baseArea = candidate.base_area || "拠点未設定";

    const alreadyAssigned = assignedUserIds.includes(String(userId));
    const buttonLabel = alreadyAssigned ? "アサイン済み" : "アサイン";

    return `
      <div class="candidate-card ${alreadyAssigned ? "is-assigned" : ""}">
        <div class="candidate-card-main">
          <div class="candidate-name">${escapeHtml(displayName)}</div>
          <div class="candidate-meta">
            ${escapeHtml(accountCode || "社員コードなし")} / ${escapeHtml(userId)}
          </div>
          <div class="candidate-meta">
            ${escapeHtml(personType)} / ${escapeHtml(contractType)} / ${escapeHtml(baseArea)}
          </div>
        </div>
        <button
          type="button"
          class="secondary-button assign-candidate-btn"
          data-internal-user-id="${escapeHtml(userId)}"
          ${alreadyAssigned ? "disabled" : ""}
        >
          ${escapeHtml(buttonLabel)}
        </button>
      </div>
    `;
  }).join("");
}

async function loadAssignmentCandidates(session) {
  if (!session || !session.isLoggedIn || !session.idToken) {
    assignmentCandidates = [];
    renderAssignmentCandidateCards();
    return;
  }

  const targetMonth =
    elements.targetMonthInput?.value ||
    getCurrentShiftData()?.month ||
    getNextMonthValue();

  const area =
    elements.areaSelect?.value ||
    getCurrentShiftData()?.area ||
    "all";

  try {
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "候補者を取得中...";
    }

    const result = await getShiftBuilderAssignmentCandidates(session.idToken, {
      targetMonth: targetMonth,
      area: area
    });

    console.log("[ShiftBuilder] assignment candidates result:", result);

    if (!result || result.success !== true) {
      throw new Error(result?.message || "候補者一覧の取得に失敗しました");
    }

    assignmentCandidates = Array.isArray(result.candidates)
      ? result.candidates
      : [];

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent =
        `候補者 ${assignmentCandidates.length} 件`;
    }

    renderAssignmentCandidateCards();
  } catch (error) {
    console.error("[ShiftBuilder] assignment candidates error:", error);

    assignmentCandidates = [];

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent =
        error.message || String(error);
    }

    renderAssignmentCandidateCards();
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
    selectedCellTitle: elements.selectedCellTitle,
    selectedCellSummary: elements.selectedCellSummary,
    assignedMembersList: elements.assignedMembersList,
    candidateList: elements.candidateList,
    assignmentCandidateStatus: elements.assignmentCandidateStatus,
    assignmentCandidateList: elements.assignmentCandidateList,
    createAssignmentBtn: elements.createAssignmentBtn,
    assignmentFormStatus: elements.assignmentFormStatus
  });

  setStatus(`セルを選択しました：${found.caseItem.title} ${found.dateItem.label}`);

  renderAssignmentCandidateCards();
}

async function loadMockShiftData(options = {}) {
  const reloadCandidates = options.reloadCandidates !== false;

  const selectedArea = elements.areaSelect?.value || "all";
  const selectedMonth =
    elements.targetMonthInput?.value ||
    getNextMonthValue();

  let apiResult = null;
  let shiftDataSource = "mock";

  try {
    setLoading(true, "ShiftBuilder月次データAPIを確認中...");

    const session = await requireShiftBuilderSession();

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      return;
    }

    setCurrentSession(session);

    apiResult = await getShiftBuilderMonthData(session.idToken, {
      targetMonth: selectedMonth,
      area: selectedArea
    });

    console.log("[ShiftBuilder] month data API result:", apiResult);

    if (!apiResult || apiResult.success !== true) {
      throw new Error(apiResult?.message || "月次シフトデータAPIの取得に失敗しました");
    }
  } catch (error) {
    console.error("[ShiftBuilder] month data API error:", error);
    setStatus(`月次データAPI確認エラー：${error.message || String(error)} / 仮データ表示に切り替えます。`);
  } finally {
    setLoading(false);
  }

  const apiData = apiResult?.data;
  const hasApiCases =
    apiData &&
    Array.isArray(apiData.cases) &&
    apiData.cases.length > 0;

  const shiftData = hasApiCases
    ? {
        ...apiData,
        month: apiData.month || selectedMonth,
        area: apiData.area || selectedArea
      }
    : {
        ...mockShiftData,
        month: selectedMonth,
        area: selectedArea
      };

  if (hasApiCases) {
    shiftDataSource = "api";
  }

  setCurrentShiftData(shiftData);

  renderSummary(shiftData, {
    requiredTotalText: elements.requiredTotalText,
    assignedTotalText: elements.assignedTotalText,
    shortageTotalText: elements.shortageTotalText,
    completionRateText: elements.completionRateText,
    unassignedCellText: elements.unassignedCellText,
    overCellText: elements.overCellText
  });

  renderShiftTable(
    shiftData,
    {
      shiftTableHead: elements.shiftTableHead,
      shiftTableBody: elements.shiftTableBody
    },
    {
      onSelectCell: selectShiftCell
    }
  );

  resetSelectedCell();

  resetDetailPanel({
    selectedCellTitle: elements.selectedCellTitle,
    selectedCellSummary: elements.selectedCellSummary,
    assignedMembersList: elements.assignedMembersList,
    candidateList: elements.candidateList,
    assignmentUserIdInput: elements.assignmentUserIdInput,
    assignmentCandidateStatus: elements.assignmentCandidateStatus,
    assignmentCandidateList: elements.assignmentCandidateList,
    createAssignmentBtn: elements.createAssignmentBtn,
    assignmentFormStatus: elements.assignmentFormStatus
  });

  if (shiftDataSource === "api") {
    setStatus(
      `APIデータのシフト表を表示しました：${shiftData.month} / cases=${shiftData.cases.length}`
    );
  } else {
    setStatus(
      `APIは疎通OKですが案件データが未取得のため、仮データを表示しています。API dates=${apiData?.dates?.length || 0} / cases=${apiData?.cases?.length || 0}`
    );
  }

  const currentSession = getCurrentSession();

  if (reloadCandidates && currentSession?.isLoggedIn) {
    await loadAssignmentCandidates(currentSession);
  } else {
    renderAssignmentCandidateCards();
  }
}

async function createAssignmentFromSelectedCell(internalUserId) {
  const selectedCell = getSelectedCell();

  if (!selectedCell) {
    setStatus("アサイン作成にはセル選択が必要です。");
    return;
  }

  const { caseItem, dateItem, cell } = selectedCell;
  const targetInternalUserId = String(internalUserId || "").trim();

  if (!targetInternalUserId) {
    setStatus("アサイン候補者を選択してください。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "アサイン候補者を選択してください。";
    }
    return;
  }

  if (Number(cell.required || 0) <= 0) {
    setStatus("必要枠のないセルにはアサイン作成できません。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "必要枠のないセルにはアサイン作成できません。";
    }
    return;
  }

  if (!cell.case_date_id) {
    setStatus("case_date_id がないため、アサイン作成できません。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "case_date_id がないセルです。";
    }
    return;
  }

  const alreadyAssigned = Array.isArray(cell.assigned)
    ? cell.assigned.some((member) => {
        return String(member.internal_user_id || "") === targetInternalUserId;
      })
    : false;

  if (alreadyAssigned) {
    setStatus("このユーザーはすでに選択セルにアサイン済みです。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "同じユーザーは重複アサインできません。";
    }
    return;
  }

  try {
    setLoading(true, "アサインを作成中...");

    let session = getCurrentSession();

    if (!session || !session.isLoggedIn || !session.idToken) {
      session = await requireShiftBuilderSession();
      setCurrentSession(session);
    }

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      return;
    }

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "アサインを作成中...";
    }

    const shiftData = getCurrentShiftData();
    const targetMonth =
      shiftData?.month ||
      elements.targetMonthInput?.value ||
      getNextMonthValue();

    const result = await createShiftBuilderAssignment(session.idToken, {
      targetMonth: targetMonth,
      area: caseItem.area || elements.areaSelect?.value || "all",
      caseId: caseItem.caseId,
      caseDateId: cell.case_date_id,
      workDate: dateItem.date,
      internalUserId: targetInternalUserId,
      assignmentNote: "ShiftBuilder画面から作成"
    });

    console.log("[ShiftBuilder] create assignment result:", result);

    if (!result || result.success !== true) {
      throw new Error(result?.message || "アサイン作成に失敗しました");
    }

    setStatus(`アサインを作成しました：${caseItem.title} ${dateItem.label} / ${targetInternalUserId}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "アサインを作成しました。シフト表を再取得します。";
    }

    await loadMockShiftData({
      reloadCandidates: false
    });

    renderAssignmentCandidateCards();
  } catch (error) {
    console.error("[ShiftBuilder] create assignment error:", error);
    setStatus(error.message || String(error));

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = error.message || String(error);
    }
  } finally {
    setLoading(false);
  }
}

async function archiveAssignmentFromButton(assignmentId) {
  if (!assignmentId) {
    setStatus("解除対象の assignment_id が取得できませんでした。");
    return;
  }

  try {
    setLoading(true, "アサインを解除中...");

    let session = getCurrentSession();

    if (!session || !session.isLoggedIn || !session.idToken) {
      session = await requireShiftBuilderSession();
      setCurrentSession(session);
    }

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      return;
    }

    const result = await archiveShiftBuilderAssignment(
      session.idToken,
      assignmentId
    );

    console.log("[ShiftBuilder] archive assignment result:", result);

    if (!result || result.success !== true) {
      throw new Error(result?.message || "アサイン解除に失敗しました");
    }

    setStatus(`アサインを解除しました：${assignmentId}`);

    await loadMockShiftData({
      reloadCandidates: false
    });

    renderAssignmentCandidateCards();
  } catch (error) {
    console.error("[ShiftBuilder] archive assignment error:", error);
    setStatus(error.message || String(error));
  } finally {
    setLoading(false);
  }
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

    elements.apiStatusText.textContent = "接続OK";

    setLoading(true, "ShiftBuilder権限を確認中...");
    const currentUserResult = await getCurrentShiftBuilderUser(session.idToken);

    setCurrentUser(normalizeCurrentUser(currentUserResult));

    console.log("[ShiftBuilder] current user:", currentUserResult);

    renderUser(currentUserResult);

    await loadMockShiftData();
  } catch (error) {
    console.error("[ShiftBuilder] init error:", error);

    elements.operatorText.textContent = "確認エラー";
    elements.permissionText.textContent = "ShiftBuilderの初期化中にエラーが発生しました";
    elements.permissionBadge.textContent = "エラー";

    elements.apiStatusText.textContent = "エラー";

    setStatus(error.message || String(error));
  } finally {
    setLoading(false);
  }
}

elements.dashboardBtn?.addEventListener("click", () => {
  window.location.href = DASHBOARD_URL;
});

elements.reloadBtn?.addEventListener("click", () => {
  window.location.reload();
});

elements.loadShiftDataBtn?.addEventListener("click", () => {
  loadMockShiftData();
});

elements.assignmentCandidateList?.addEventListener("click", (event) => {
  const button = event.target.closest(".assign-candidate-btn");

  if (!button) {
    return;
  }

  const internalUserId = button.dataset.internalUserId || "";

  createAssignmentFromSelectedCell(internalUserId);
});

elements.assignedMembersList?.addEventListener("click", (event) => {
  const button = event.target.closest(".archive-assignment-btn");

  if (!button) {
    return;
  }

  const assignmentId = button.dataset.assignmentId || "";

  archiveAssignmentFromButton(assignmentId);
});

init();

// ===== ShiftBuilder main.js ここまで =====
