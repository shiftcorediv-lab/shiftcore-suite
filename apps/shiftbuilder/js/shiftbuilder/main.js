// ===== ShiftBuilder main.js ここから =====

import { DASHBOARD_URL } from "./config.js";
import { requireShiftBuilderSession, getLoginUrl } from "./auth.js";
import {
  pingShiftBuilderApi,
  getCurrentShiftBuilderUser,
  getShiftBuilderMonthData,
  createShiftBuilderAssignment
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
  getCurrentSession,
  getSelectedCell,
  setSelectedCell,
  resetSelectedCell
} from "./state.js";
import { elements } from "./dom.js";

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
      ? "ShiftBuilderを利用できます。現在は開発中トップ画面です。"
      : "ShiftBuilderを閲覧できます。編集権限はありません。"
  );
}

function initializeFilters() {
  if (elements.targetMonthInput && !elements.targetMonthInput.value) {
    elements.targetMonthInput.value = mockShiftData.month || getCurrentMonthValue();
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
    createAssignmentBtn: elements.createAssignmentBtn,
    assignmentFormStatus: elements.assignmentFormStatus
  });

  setStatus(`セルを選択しました：${found.caseItem.title} ${found.dateItem.label}`);
}

async function loadMockShiftData() {
  const selectedArea = elements.areaSelect?.value || "all";
  const selectedMonth = elements.targetMonthInput?.value || mockShiftData.month;

  let apiResult = null;
  let shiftDataSource = "mock";

  try {
    setLoading(true, "ShiftBuilder月次データAPIを確認中...");

    const session = await requireShiftBuilderSession();

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      return;
    }

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
}

async function createAssignmentFromSelectedCell() {
  const selectedCell = getSelectedCell();

  if (!selectedCell) {
    setStatus("アサイン作成にはセル選択が必要です。");
    return;
  }

  const { caseItem, dateItem, cell } = selectedCell;
  const internalUserId = elements.assignmentUserIdInput?.value?.trim() || "";

  if (!internalUserId) {
    setStatus("internal_user_id を入力してください。");
    if (elements.assignmentFormStatus) {
      elements.assignmentFormStatus.textContent = "internal_user_id を入力してください。";
    }
    return;
  }

  if (Number(cell.required || 0) <= 0) {
    setStatus("必要枠のないセルにはアサイン作成できません。");
    if (elements.assignmentFormStatus) {
      elements.assignmentFormStatus.textContent = "必要枠のないセルにはアサイン作成できません。";
    }
    return;
  }

  if (!cell.case_date_id) {
    setStatus("case_date_id がないため、アサイン作成できません。");
    if (elements.assignmentFormStatus) {
      elements.assignmentFormStatus.textContent = "case_date_id がないセルです。";
    }
    return;
  }

  const alreadyAssigned = Array.isArray(cell.assigned)
    ? cell.assigned.some((member) => {
        return String(member.internal_user_id || "") === internalUserId;
      })
    : false;

  if (alreadyAssigned) {
    setStatus("このユーザーはすでに選択セルにアサイン済みです。");
    if (elements.assignmentFormStatus) {
      elements.assignmentFormStatus.textContent = "同じユーザーは重複アサインできません。";
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

    if (elements.createAssignmentBtn) {
      elements.createAssignmentBtn.disabled = true;
    }

    if (elements.assignmentFormStatus) {
      elements.assignmentFormStatus.textContent = "アサインを作成中...";
    }

    const shiftData = getCurrentShiftData();
    const targetMonth =
      shiftData?.month ||
      elements.targetMonthInput?.value ||
      mockShiftData.month;

    const result = await createShiftBuilderAssignment(session.idToken, {
      targetMonth: targetMonth,
      area: caseItem.area || elements.areaSelect?.value || "all",
      caseId: caseItem.caseId,
      caseDateId: cell.case_date_id,
      workDate: dateItem.date,
      internalUserId: internalUserId,
      assignmentNote: "ShiftBuilder画面から作成"
    });

    console.log("[ShiftBuilder] create assignment result:", result);

    if (!result || result.success !== true) {
      throw new Error(result?.message || "アサイン作成に失敗しました");
    }

    setStatus(`アサインを作成しました：${caseItem.title} ${dateItem.label} / ${internalUserId}`);

    if (elements.assignmentFormStatus) {
      elements.assignmentFormStatus.textContent = "アサインを作成しました。シフト表を再取得します。";
    }

    await loadMockShiftData();
  } catch (error) {
    console.error("[ShiftBuilder] create assignment error:", error);
    setStatus(error.message || String(error));

    if (elements.assignmentFormStatus) {
      elements.assignmentFormStatus.textContent = error.message || String(error);
    }

    if (elements.createAssignmentBtn) {
      elements.createAssignmentBtn.disabled = false;
    }
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

elements.createAssignmentBtn?.addEventListener("click", () => {
  createAssignmentFromSelectedCell();
});

init();

// ===== ShiftBuilder main.js ここまで =====
