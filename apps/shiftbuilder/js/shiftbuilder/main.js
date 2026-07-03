// ===== ShiftBuilder main.js ここから =====

import { DASHBOARD_URL } from "./config.js";
import { requireShiftBuilderSession, getLoginUrl } from "./auth.js";
import {
  pingShiftBuilderApi,
  getCurrentShiftBuilderUser,
  getShiftBuilderMonthData,
  createShiftBuilderAssignment,
  archiveShiftBuilderAssignment,
  replaceShiftBuilderAssignment,
  getShiftBuilderAssignmentCandidates
} from "./api.js";
import { mockShiftData } from "./mock-data.js";
import { escapeHtml } from "./utils.js";
import { getPermissionLabel, canEdit } from "./permissions.js";
import { renderSummary } from "./render-summary.js";
import { renderShiftTable } from "./render-shift-table.js";
import {
  renderSelectedCell,
  resetDetailPanel,
  renderCellPreviewPopover,
  renderCellActionPopover
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
let activePopoverMode = "";
let activePopoverKey = null;
let activePopoverAnchor = null;

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

function shiftMonthValue(monthValue, offset) {
  const normalizedMonthValue = String(monthValue || "").trim();
  const parts = normalizedMonthValue.split("-");

  if (parts.length !== 2) {
    return getNextMonthValue();
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);

  if (!year || !month || month < 1 || month > 12) {
    return getNextMonthValue();
  }

  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + offset);

  const shiftedYear = date.getFullYear();
  const shiftedMonth = String(date.getMonth() + 1).padStart(2, "0");

  return `${shiftedYear}-${shiftedMonth}`;
}

function moveTargetMonth(offset) {
  if (!elements.targetMonthInput) {
    return;
  }

  const currentValue = elements.targetMonthInput.value || getNextMonthValue();
  elements.targetMonthInput.value = shiftMonthValue(currentValue, offset);

  loadMockShiftData();
}

function createPendingAssignmentId() {
  return `PENDING-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSelectedCellKey(selectedCell) {
  if (!selectedCell) {
    return null;
  }

  return {
    caseId: selectedCell.caseItem?.caseId || "",
    date: selectedCell.dateItem?.date || ""
  };
}

function isSelectedCellKey(caseId, date) {
  const selectedCell = getSelectedCell();
  const key = getSelectedCellKey(selectedCell);

  return key?.caseId === caseId && key?.date === date;
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

function findCandidateByInternalUserId(internalUserId) {
  return assignmentCandidates.find((candidate) => {
    return String(candidate.internal_user_id || "") === String(internalUserId || "");
  }) || null;
}

function extractAssignmentFromResult(result) {
  return (
    result?.assignment ||
    result?.data?.assignment ||
    result?.data?.created_assignment ||
    result?.created_assignment ||
    result?.record ||
    result?.data?.record ||
    null
  );
}

function extractAssignmentIdFromResult(result) {
  const assignment = extractAssignmentFromResult(result);

  return (
    assignment?.assignment_id ||
    assignment?.assignmentId ||
    result?.assignment_id ||
    result?.assignmentId ||
    result?.data?.assignment_id ||
    result?.data?.assignmentId ||
    ""
  );
}

function buildAssignedMemberFromCandidate(internalUserId, result, pendingAssignmentId) {
  const candidate = findCandidateByInternalUserId(internalUserId);
  const assignment = extractAssignmentFromResult(result);
  const assignmentId = extractAssignmentIdFromResult(result) || pendingAssignmentId;

  const displayName =
    assignment?.display_name ||
    assignment?.displayName ||
    assignment?.name ||
    candidate?.display_name ||
    candidate?.displayName ||
    candidate?.name ||
    internalUserId;

  const isPending = !extractAssignmentIdFromResult(result);

  return {
    assignment_id: assignmentId,
    assignmentId: assignmentId,
    client_pending_id: pendingAssignmentId,
    internal_user_id: internalUserId,
    internalUserId: internalUserId,
    name: displayName,
    display_name: displayName,
    displayName: displayName,
    account_code:
      assignment?.account_code ||
      candidate?.account_code ||
      candidate?.employee_code ||
      "",
    employee_code:
      assignment?.employee_code ||
      candidate?.employee_code ||
      candidate?.account_code ||
      "",
    person_type:
      assignment?.person_type ||
      candidate?.person_type ||
      "",
    contract_type:
      assignment?.contract_type ||
      candidate?.contract_type ||
      "",
    assignment_status: isPending ? "saving" : "assigned",
    assignment_note: isPending ? "保存中..." : "ShiftBuilder画面から作成",
    note: isPending ? "保存中..." : "ShiftBuilder画面から作成",
    is_pending: isPending,
    isPending: isPending
  };
}

function updatePendingAssignment(caseId, date, pendingAssignmentId, result) {
  const assignmentId = extractAssignmentIdFromResult(result);
  const assignment = extractAssignmentFromResult(result);

  if (!assignmentId) {
    return false;
  }

  const found = findShiftCell(caseId, date);

  if (!found?.cell || !Array.isArray(found.cell.assigned)) {
    return false;
  }

  const index = found.cell.assigned.findIndex((member) => {
    return (
      String(member.client_pending_id || "") === String(pendingAssignmentId) ||
      String(member.assignment_id || member.assignmentId || "") === String(pendingAssignmentId)
    );
  });

  if (index < 0) {
    return false;
  }

  found.cell.assigned[index] = {
    ...found.cell.assigned[index],
    ...assignment,
    assignment_id: assignmentId,
    assignmentId: assignmentId,
    assignment_status: assignment?.assignment_status || "assigned",
    assignment_note: assignment?.assignment_note || "ShiftBuilder画面から作成",
    note: assignment?.assignment_note || "ShiftBuilder画面から作成",
    is_pending: false,
    isPending: false
  };

  if (isSelectedCellKey(caseId, date)) {
    setSelectedCell(found);
  }

  renderCurrentShiftView();

  return true;
}

function getSameDayAssignmentsForUser(internalUserId, selectedCell) {
  const shiftData = getCurrentShiftData();

  if (!shiftData || !selectedCell) {
    return [];
  }

  const targetUserId = String(internalUserId || "");
  const selectedCaseId = selectedCell.caseItem?.caseId || "";
  const selectedDate = selectedCell.dateItem?.date || "";

  if (!targetUserId || !selectedDate) {
    return [];
  }

  const matches = [];

  shiftData.cases.forEach((caseItem) => {
    const cell = caseItem.cells?.[selectedDate];

    if (!cell || !Array.isArray(cell.assigned)) {
      return;
    }

    const isSelectedCell = String(caseItem.caseId || "") === String(selectedCaseId);

    if (isSelectedCell) {
      return;
    }

    cell.assigned.forEach((member) => {
      const memberUserId = String(member.internal_user_id || member.internalUserId || "");

      if (memberUserId !== targetUserId) {
        return;
      }

      matches.push({
        caseId: caseItem.caseId || "",
        caseTitle: caseItem.title || caseItem.store_name || caseItem.caseId || "別案件",
        date: selectedDate,
        assignmentId: member.assignment_id || member.assignmentId || "",
        displayName:
          member.display_name ||
          member.displayName ||
          member.name ||
          targetUserId
      });
    });
  });

  return matches;
}

function hasSameDayAssignmentForUser(internalUserId, selectedCell) {
  return getSameDayAssignmentsForUser(internalUserId, selectedCell).length > 0;
}

function getOrCreateCellPopover() {
  const existing = document.getElementById("shiftbuilderCellPopover");

  if (existing) {
    return existing;
  }

  const popover = document.createElement("div");
  popover.id = "shiftbuilderCellPopover";
  popover.className = "cell-popover";
  popover.hidden = true;

  popover.addEventListener("click", (event) => {
    const closeButton = event.target.closest("[data-popover-action='close']");

    if (closeButton) {
      hideCellPopover({
        resetSelection: true,
        statusMessage: "セル選択を解除しました。"
      });
      return;
    }

    const assignButton = event.target.closest(".assign-candidate-btn");

    if (assignButton) {
      assignButton.disabled = true;

      const internalUserId = assignButton.dataset.internalUserId || "";
      const replaceAssignmentId = assignButton.dataset.replaceAssignmentId || "";

      if (replaceAssignmentId) {
        assignButton.textContent = "入替中...";
        replaceAssignmentFromSelectedCell(internalUserId, replaceAssignmentId);
      } else {
        assignButton.textContent = "反映中...";
        createAssignmentFromSelectedCell(internalUserId);
      }

      return;
    }

    const archiveButton = event.target.closest(".archive-assignment-btn");

    if (archiveButton) {
      archiveButton.disabled = true;
      archiveButton.textContent = "解除中...";

      const assignmentId = archiveButton.dataset.assignmentId || "";

      archiveAssignmentFromButton(assignmentId);
    }
  });

  document.body.appendChild(popover);

  return popover;
}

function getPopoverKey(caseId, date) {
  return {
    caseId: caseId || "",
    date: date || ""
  };
}

function isSamePopoverKey(keyA, keyB) {
  return (
    keyA?.caseId === keyB?.caseId &&
    keyA?.date === keyB?.date
  );
}

function setPopoverPosition(popover, anchorElement) {
  if (!popover || !anchorElement) {
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gap = 8;
  const margin = 10;

  popover.style.visibility = "hidden";
  popover.hidden = false;

  const popoverRect = popover.getBoundingClientRect();
  const popoverWidth = popoverRect.width || 360;
  const popoverHeight = popoverRect.height || 220;

  const rightSpace = viewportWidth - anchorRect.right;
  const leftSpace = anchorRect.left;

  let left =
    rightSpace >= popoverWidth + gap + margin
      ? anchorRect.right + gap
      : anchorRect.left - popoverWidth - gap;

  if (left < margin) {
    left = margin;
  }

  if (left + popoverWidth > viewportWidth - margin) {
    left = Math.max(margin, viewportWidth - popoverWidth - margin);
  }

  let top = anchorRect.top;

  if (top + popoverHeight > viewportHeight - margin) {
    top = viewportHeight - popoverHeight - margin;
  }

  if (top < margin) {
    top = margin;
  }

  const placement = leftSpace > rightSpace ? "left" : "right";

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.visibility = "";
  popover.dataset.placement = placement;
}

function hideCellPopover(options = {}) {
  const {
    resetSelection = false,
    statusMessage = ""
  } = options;

  const popover = document.getElementById("shiftbuilderCellPopover");

  if (popover) {
    popover.hidden = true;
    popover.className = "cell-popover";
    popover.innerHTML = "";
    popover.removeAttribute("data-placement");
  }

  activePopoverMode = "";
  activePopoverKey = null;
  activePopoverAnchor = null;

  if (resetSelection) {
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

    renderAssignmentCandidateCards();
  }

  if (statusMessage) {
    setStatus(statusMessage);
  }
}

function renderPreviewPopover(found, anchorElement) {
  const popover = getOrCreateCellPopover();

  popover.className = "cell-popover cell-popover-mode-preview";
  popover.innerHTML = renderCellPreviewPopover(found);
  popover.hidden = false;

  activePopoverMode = "preview";
  activePopoverKey = getSelectedCellKey(found);
  activePopoverAnchor = anchorElement;

  setPopoverPosition(popover, anchorElement);
}

function renderActionPopover(found, anchorElement) {
  const popover = getOrCreateCellPopover();

  popover.className = "cell-popover cell-popover-mode-action";
  popover.innerHTML = renderCellActionPopover(found, assignmentCandidates);
  popover.hidden = false;

  activePopoverMode = "action";
  activePopoverKey = getSelectedCellKey(found);
  activePopoverAnchor = anchorElement;

  applySameDayCandidateState(popover, found);
  setPopoverPosition(popover, anchorElement);
}

function applySameDayCandidateState(popover, selectedCell) {
  const buttons = popover.querySelectorAll(".assign-candidate-btn");

  buttons.forEach((button) => {
    const internalUserId = button.dataset.internalUserId || "";

    if (!internalUserId || button.disabled) {
      return;
    }

    const sameDayAssignments = getSameDayAssignmentsForUser(
      internalUserId,
      selectedCell
    );

    if (!sameDayAssignments.length) {
      return;
    }

    const card = button.closest(".candidate-card");
    const caseTitles = sameDayAssignments
      .map((item) => item.caseTitle)
      .join(" / ");

    button.disabled = true;
    button.textContent = "同日あり";

    if (card) {
      card.classList.add("is-conflict");

      const warning = document.createElement("div");
      warning.className = "candidate-warning";
      warning.textContent = `同日別案件あり：${caseTitles}`;

      const main = card.querySelector(".candidate-card-main");
      if (main) {
        main.appendChild(warning);
      }
    }
  });
}

function findRenderedShiftCellButton(caseId, date) {
  if (!elements.shiftTableBody) {
    return null;
  }

  const escapedCaseId = CSS.escape(String(caseId || ""));
  const escapedDate = CSS.escape(String(date || ""));

  return elements.shiftTableBody.querySelector(
    `.shift-cell[data-case-id="${escapedCaseId}"][data-date="${escapedDate}"]`
  );
}

function refreshActiveActionPopover() {
  if (activePopoverMode !== "action") {
    return;
  }

  const selectedCell = getSelectedCell();

  if (!selectedCell) {
    hideCellPopover();
    return;
  }

  const selectedKey = getSelectedCellKey(selectedCell);
  const anchorElement =
    findRenderedShiftCellButton(selectedKey.caseId, selectedKey.date) ||
    activePopoverAnchor;

  if (!anchorElement) {
    hideCellPopover();
    return;
  }

  renderActionPopover(selectedCell, anchorElement);
}

function previewShiftCell(caseId, date, anchorElement) {
  if (activePopoverMode === "action") {
    return;
  }

  const found = findShiftCell(caseId, date);

  if (!found) {
    return;
  }

  renderPreviewPopover(found, anchorElement);
}

function leaveShiftCell(caseId, date) {
  if (activePopoverMode !== "preview") {
    return;
  }

  const nextKey = getPopoverKey(caseId, date);

  if (!isSamePopoverKey(activePopoverKey, nextKey)) {
    return;
  }

  hideCellPopover();
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
    ? cell.assigned.map((member) => String(member.internal_user_id || member.internalUserId || ""))
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
    const sameDayAssignments = getSameDayAssignmentsForUser(userId, selectedCell);
    const hasSameDayAssignment = sameDayAssignments.length > 0;

    const warningText = hasSameDayAssignment
      ? `同日別案件あり：${sameDayAssignments.map((item) => item.caseTitle).join(" / ")}`
      : "";

    const buttonLabel = alreadyAssigned
      ? "アサイン済み"
      : hasSameDayAssignment
        ? "同日あり"
        : "アサイン";

    const isDisabled = alreadyAssigned || hasSameDayAssignment;

    return `
      <div class="candidate-card ${alreadyAssigned ? "is-assigned" : ""} ${hasSameDayAssignment ? "is-conflict" : ""}">
        <div class="candidate-card-main">
          <div class="candidate-name">${escapeHtml(displayName)}</div>
          <div class="candidate-meta">
            ${escapeHtml(accountCode || "社員コードなし")} / ${escapeHtml(userId)}
          </div>
          <div class="candidate-meta">
            ${escapeHtml(personType)} / ${escapeHtml(contractType)} / ${escapeHtml(baseArea)}
          </div>
          ${
            warningText
              ? `<div class="candidate-warning">${escapeHtml(warningText)}</div>`
              : ""
          }
        </div>
        <button
          type="button"
          class="secondary-button assign-candidate-btn"
          data-internal-user-id="${escapeHtml(userId)}"
          ${isDisabled ? "disabled" : ""}
        >
          ${escapeHtml(buttonLabel)}
        </button>
      </div>
    `;
  }).join("");
}

function renderCurrentShiftView() {
  const shiftData = getCurrentShiftData();

  if (!shiftData) {
    return;
  }

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
      onSelectCell: selectShiftCell,
      onPreviewCell: previewShiftCell,
      onLeaveCell: leaveShiftCell
    }
  );

  const selectedCell = getSelectedCell();

  if (selectedCell) {
    renderSelectedCell(selectedCell, {
      selectedCellTitle: elements.selectedCellTitle,
      selectedCellSummary: elements.selectedCellSummary,
      assignedMembersList: elements.assignedMembersList,
      candidateList: elements.candidateList,
      assignmentCandidateStatus: elements.assignmentCandidateStatus,
      assignmentCandidateList: elements.assignmentCandidateList,
      createAssignmentBtn: elements.createAssignmentBtn,
      assignmentFormStatus: elements.assignmentFormStatus
    });
  }

  renderAssignmentCandidateCards();
  refreshActiveActionPopover();
}

async function loadAssignmentCandidates(session) {
  if (!session || !session.isLoggedIn || !session.idToken) {
    assignmentCandidates = [];
    renderAssignmentCandidateCards();
    refreshActiveActionPopover();
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
    refreshActiveActionPopover();
  } catch (error) {
    console.error("[ShiftBuilder] assignment candidates error:", error);

    assignmentCandidates = [];

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent =
        error.message || String(error);
    }

    renderAssignmentCandidateCards();
    refreshActiveActionPopover();
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

function openDetailPanel() {
  const selectedCell = getSelectedCell();

  if (!selectedCell) {
    return;
  }

  const selectedKey = getSelectedCellKey(selectedCell);
  const anchorElement = findRenderedShiftCellButton(
    selectedKey.caseId,
    selectedKey.date
  );

  if (!anchorElement) {
    return;
  }

  renderActionPopover(selectedCell, anchorElement);
}

function closeDetailPanel() {
  hideCellPopover({
    resetSelection: true,
    statusMessage: "セル選択を解除しました。"
  });
}

function selectShiftCell(caseId, date, anchorElement) {
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

  renderActionPopover(found, anchorElement || findRenderedShiftCellButton(caseId, date));

  setStatus(`セルを選択しました：${found.caseItem.title} ${found.dateItem.label}`);

  renderAssignmentCandidateCards();
}

async function loadMockShiftData(options = {}) {
  const reloadCandidates = options.reloadCandidates !== false;
  const silent = options.silent === true;
  const preserveSelectedCell = options.preserveSelectedCell === true;
  const suppressStatus = options.suppressStatus === true;
  const selectedKey = getSelectedCellKey(getSelectedCell());

  const selectedArea = elements.areaSelect?.value || "all";
  const selectedMonth =
    elements.targetMonthInput?.value ||
    getNextMonthValue();

  let apiResult = null;
  let shiftDataSource = "mock";

  try {
    if (!silent) {
      setLoading(true, "ShiftBuilder月次データAPIを確認中...");
    }

    const session = await requireShiftBuilderSession();

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      throw new Error("ログイン状態を確認できなかったため、入れ替えを保存できませんでした。");
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

    if (!suppressStatus) {
      setStatus(`月次データAPI確認エラー：${error.message || String(error)} / 仮データ表示に切り替えます。`);
    }
  } finally {
    if (!silent) {
      setLoading(false);
    }
  }

  const apiData = apiResult?.data;

  let shiftData = null;

  const hasValidApiData =
    apiData &&
    Array.isArray(apiData.dates) &&
    Array.isArray(apiData.cases);

  if (hasValidApiData) {
    shiftData = {
      ...apiData,
      month: apiData.month || selectedMonth,
      area: apiData.area || selectedArea
    };
    shiftDataSource = "api";
  } else {
    shiftData = {
      ...mockShiftData,
      month: selectedMonth,
      area: selectedArea
    };
    shiftDataSource = "mock";
  }

  setCurrentShiftData(shiftData);

  hideCellPopover();

  if (preserveSelectedCell && selectedKey?.caseId && selectedKey?.date) {
    const restored = findShiftCell(selectedKey.caseId, selectedKey.date);

    if (restored) {
      setSelectedCell(restored);
    } else {
      resetSelectedCell();
    }
  } else {
    resetSelectedCell();
  }

  renderCurrentShiftView();

  if (!getSelectedCell()) {
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
  }

  if (!suppressStatus) {
    if (shiftDataSource === "api") {
      if (shiftData.cases.length > 0) {
        setStatus(
          `APIデータのシフト表を表示しました：${shiftData.month} / cases=${shiftData.cases.length}`
        );
      } else {
        setStatus(
          `対象月の案件データはありません：${shiftData.month} / cases=0`
        );
      }
    } else {
      setStatus(
        "月次データAPIから有効なデータを取得できなかったため、仮データを表示しています。"
      );
    }
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

    const canAssignWithoutCaseDate =
    cell.assignable_without_case_date === true ||
    cell.flexible_assignment === true ||
    cell.is_days_mode === true;

  if (Number(cell.required || 0) <= 0 && !canAssignWithoutCaseDate) {
    setStatus("必要枠のないセルにはアサイン作成できません。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "必要枠のないセルにはアサイン作成できません。";
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

  if (hasSameDayAssignmentForUser(targetInternalUserId, selectedCell)) {
    const sameDayAssignments = getSameDayAssignmentsForUser(
      targetInternalUserId,
      selectedCell
    );

    const caseTitles = sameDayAssignments
      .map((item) => item.caseTitle)
      .join(" / ");

    setStatus(`このユーザーは同日に別案件へアサイン済みです：${caseTitles}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent =
        `同日別案件あり：${caseTitles}`;
    }

    refreshActiveActionPopover();

    return;
  }

  const caseId = caseItem.caseId;
  const workDate = dateItem.date;
  const previousAssigned = Array.isArray(cell.assigned)
    ? [...cell.assigned]
    : [];

  const pendingAssignmentId = createPendingAssignmentId();

  const optimisticMember = buildAssignedMemberFromCandidate(
    targetInternalUserId,
    null,
    pendingAssignmentId
  );

  if (!Array.isArray(cell.assigned)) {
    cell.assigned = [];
  }

  cell.assigned.push(optimisticMember);

  setSelectedCell({
    caseItem,
    dateItem,
    cell
  });

  renderCurrentShiftView();

  setStatus(`アサインを反映しました：${caseItem.title} ${dateItem.label} / ${targetInternalUserId}`);

  if (elements.assignmentCandidateStatus) {
    elements.assignmentCandidateStatus.textContent = "";
  }

  try {
    let session = getCurrentSession();

    if (!session || !session.isLoggedIn || !session.idToken) {
      session = await requireShiftBuilderSession();
      setCurrentSession(session);
    }

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      return;
    }

    const shiftData = getCurrentShiftData();
    const targetMonth =
      shiftData?.month ||
      elements.targetMonthInput?.value ||
      getNextMonthValue();

    const result = await createShiftBuilderAssignment(session.idToken, {
      targetMonth: targetMonth,
      area: caseItem.area || elements.areaSelect?.value || "all",
      caseId: caseId,
      caseDateId: cell.case_date_id || "",
      workDate: workDate,
      internalUserId: targetInternalUserId,
      assignmentNote: "ShiftBuilder画面から作成"
    });

    console.log("[ShiftBuilder] create assignment result:", result);

    if (!result || result.success !== true) {
      throw new Error(result?.message || "アサイン作成に失敗しました");
    }

    const updated = updatePendingAssignment(
      caseId,
      workDate,
      pendingAssignmentId,
      result
    );

    if (!updated) {
      await loadMockShiftData({
        reloadCandidates: false,
        silent: true,
        preserveSelectedCell: true,
        suppressStatus: true
      });
    }

    setStatus(`アサインを保存しました：${caseItem.title} ${dateItem.label} / ${targetInternalUserId}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "アサインを保存しました。";
    }

    refreshActiveActionPopover();
  } catch (error) {
    console.error("[ShiftBuilder] create assignment error:", error);

    const found = findShiftCell(caseId, workDate);

    if (found?.cell) {
      found.cell.assigned = previousAssigned;

      if (isSelectedCellKey(caseId, workDate)) {
        setSelectedCell(found);
      }

      renderCurrentShiftView();
    }

    setStatus(error.message || String(error));

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = error.message || String(error);
    }

    refreshActiveActionPopover();
  }
}

async function replaceAssignmentFromSelectedCell(internalUserId, replaceAssignmentId) {
  const selectedCell = getSelectedCell();

  if (!selectedCell) {
    setStatus("入れ替えにはセル選択が必要です。");
    return;
  }

  const { caseItem, dateItem, cell } = selectedCell;
  const targetInternalUserId = String(internalUserId || "").trim();
  const targetReplaceAssignmentId = String(replaceAssignmentId || "").trim();

  if (!targetInternalUserId || !targetReplaceAssignmentId) {
    setStatus("入れ替え対象または候補者を取得できませんでした。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "入れ替え対象または候補者を取得できませんでした。";
    }
    return;
  }

  const previousAssigned = Array.isArray(cell.assigned)
    ? [...cell.assigned]
    : [];

  const replaceIndex = previousAssigned.findIndex((member) => {
    return String(member.assignment_id || member.assignmentId || "") === targetReplaceAssignmentId;
  });

  if (replaceIndex < 0) {
    setStatus("入れ替え対象のアサインが見つかりませんでした。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "入れ替え対象のアサインが見つかりませんでした。";
    }
    return;
  }

  const alreadyAssigned = previousAssigned.some((member) => {
    return String(member.internal_user_id || member.internalUserId || "") === targetInternalUserId;
  });

  if (alreadyAssigned) {
    setStatus("このユーザーはすでに選択セルにアサイン済みです。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "同じユーザーには入れ替えできません。";
    }
    return;
  }

  if (hasSameDayAssignmentForUser(targetInternalUserId, selectedCell)) {
    const sameDayAssignments = getSameDayAssignmentsForUser(
      targetInternalUserId,
      selectedCell
    );

    const caseTitles = sameDayAssignments
      .map((item) => item.caseTitle)
      .join(" / ");

    setStatus(`このユーザーは同日に別案件へアサイン済みです：${caseTitles}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent =
        `同日別案件あり：${caseTitles}`;
    }

    refreshActiveActionPopover();

    return;
  }

  const caseId = caseItem.caseId;
  const workDate = dateItem.date;
  const pendingAssignmentId = createPendingAssignmentId();

  const optimisticMember = buildAssignedMemberFromCandidate(
    targetInternalUserId,
    null,
    pendingAssignmentId
  );

  optimisticMember.assignment_status = "saving";
  optimisticMember.assignment_note = "入れ替え保存中...";
  optimisticMember.note = "入れ替え保存中...";
  optimisticMember.is_pending = true;
  optimisticMember.isPending = true;

  cell.assigned = previousAssigned.map((member, index) => {
    return index === replaceIndex ? optimisticMember : member;
  });

  setSelectedCell({
    caseItem,
    dateItem,
    cell
  });

  renderCurrentShiftView();

  setStatus(`入れ替えを反映しました：${caseItem.title} ${dateItem.label} / ${targetInternalUserId}`);

  if (elements.assignmentCandidateStatus) {
    elements.assignmentCandidateStatus.textContent = "入れ替えを保存中です。";
  }

  let createResult = null;

  try {
    let session = getCurrentSession();

    if (!session || !session.isLoggedIn || !session.idToken) {
      session = await requireShiftBuilderSession();
      setCurrentSession(session);
    }

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      return;
    }

    const shiftData = getCurrentShiftData();
    const targetMonth =
      shiftData?.month ||
      elements.targetMonthInput?.value ||
      getNextMonthValue();

    createResult = await replaceShiftBuilderAssignment(session.idToken, {
      replaceAssignmentId: targetReplaceAssignmentId,
      targetMonth: targetMonth,
      area: caseItem.area || elements.areaSelect?.value || "all",
      caseId: caseId,
      caseDateId: cell.case_date_id || "",
      workDate: workDate,
      internalUserId: targetInternalUserId,
      assignmentNote: "ShiftBuilder画面から入れ替え"
    });

    console.log("[ShiftBuilder] replace assignment result:", createResult);

    if (!createResult || createResult.success !== true) {
      throw new Error(createResult?.message || "アサイン入れ替えに失敗しました");
    }

    const createdAssignmentId = extractAssignmentIdFromResult(createResult);

    if (!createdAssignmentId) {
      throw new Error("入れ替え後アサインの assignment_id を取得できませんでした");
    }

    const updated = updatePendingAssignment(
      caseId,
      workDate,
      pendingAssignmentId,
      createResult
    );

    if (!updated) {
      await loadMockShiftData({
        reloadCandidates: false,
        silent: true,
        preserveSelectedCell: true,
        suppressStatus: true
      });
    }

    setStatus(`入れ替えを保存しました：${caseItem.title} ${dateItem.label} / ${targetInternalUserId}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "入れ替えを保存しました。";
    }

    refreshActiveActionPopover();
    } catch (error) {
    console.error("[ShiftBuilder] replace assignment error:", error);

    const found = findShiftCell(caseId, workDate);

    if (found?.cell) {
      found.cell.assigned = previousAssigned;

      if (isSelectedCellKey(caseId, workDate)) {
        setSelectedCell(found);
      }

      renderCurrentShiftView();
    }

    try {
      await loadMockShiftData({
        reloadCandidates: true,
        silent: true,
        preserveSelectedCell: true,
        suppressStatus: true
      });
    } catch (reloadError) {
      console.error("[ShiftBuilder] replace failure reload error:", reloadError);
    }

    setStatus(error.message || String(error));

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = error.message || String(error);
    }

    refreshActiveActionPopover();
  }
}

async function archiveAssignmentFromButton(assignmentId) {
  if (!assignmentId) {
    setStatus("解除対象の assignment_id が取得できませんでした。");
    return;
  }

  if (String(assignmentId).startsWith("PENDING-")) {
    setStatus("保存中のアサインは、保存完了後に解除できます。");
    return;
  }

  const selectedCell = getSelectedCell();

  if (!selectedCell) {
    setStatus("解除にはセル選択が必要です。");
    return;
  }

  const { caseItem, dateItem, cell } = selectedCell;
  const caseId = caseItem.caseId;
  const workDate = dateItem.date;

  const previousAssigned = Array.isArray(cell.assigned)
    ? [...cell.assigned]
    : [];

  if (Array.isArray(cell.assigned)) {
    cell.assigned = cell.assigned.filter((member) => {
      return String(member.assignment_id || member.assignmentId || "") !== String(assignmentId);
    });
  }

  setSelectedCell({
    caseItem,
    dateItem,
    cell
  });

  renderCurrentShiftView();

  setStatus(`アサイン解除を反映しました：${assignmentId}`);

  if (elements.assignmentCandidateStatus) {
    elements.assignmentCandidateStatus.textContent = "";
  }

  try {
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

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "アサインを解除しました。";
    }

    refreshActiveActionPopover();
  } catch (error) {
    console.error("[ShiftBuilder] archive assignment error:", error);

    const found = findShiftCell(caseId, workDate);

    if (found?.cell) {
      found.cell.assigned = previousAssigned;

      if (isSelectedCellKey(caseId, workDate)) {
        setSelectedCell(found);
      }

      renderCurrentShiftView();
    }

    setStatus(error.message || String(error));

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = error.message || String(error);
    }

    refreshActiveActionPopover();
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

elements.prevMonthBtn?.addEventListener("click", () => {
  moveTargetMonth(-1);
});

elements.nextMonthBtn?.addEventListener("click", () => {
  moveTargetMonth(1);
});

elements.closeDetailPanelBtn?.addEventListener("click", () => {
  closeDetailPanel();
});

elements.assignmentCandidateList?.addEventListener("click", (event) => {
  const button = event.target.closest(".assign-candidate-btn");

  if (!button) {
    return;
  }

  button.disabled = true;

  const internalUserId = button.dataset.internalUserId || "";
  const replaceAssignmentId = button.dataset.replaceAssignmentId || "";

  if (replaceAssignmentId) {
    button.textContent = "入替中...";
    replaceAssignmentFromSelectedCell(internalUserId, replaceAssignmentId);
  } else {
    button.textContent = "反映中...";
    createAssignmentFromSelectedCell(internalUserId);
  }
});

elements.assignedMembersList?.addEventListener("click", (event) => {
  const button = event.target.closest(".archive-assignment-btn");

  if (!button) {
    return;
  }

  button.disabled = true;
  button.textContent = "解除中...";

  const assignmentId = button.dataset.assignmentId || "";

  archiveAssignmentFromButton(assignmentId);
});

document.addEventListener("click", (event) => {
  const popover = document.getElementById("shiftbuilderCellPopover");

  if (popover && popover.contains(event.target)) {
    return;
  }

  if (event.target.closest(".shift-cell")) {
    return;
  }

  if (activePopoverMode === "action") {
    hideCellPopover({
      resetSelection: true
    });
  }
});

window.addEventListener("resize", () => {
  if (!activePopoverMode || !activePopoverAnchor) {
    return;
  }

  const popover = document.getElementById("shiftbuilderCellPopover");

  if (!popover || popover.hidden) {
    return;
  }

  setPopoverPosition(popover, activePopoverAnchor);
});

window.addEventListener("scroll", () => {
  if (!activePopoverMode || !activePopoverAnchor) {
    return;
  }

  const popover = document.getElementById("shiftbuilderCellPopover");

  if (!popover || popover.hidden) {
    return;
  }

  setPopoverPosition(popover, activePopoverAnchor);
}, true);

init();

// ===== ShiftBuilder main.js ここまで =====
