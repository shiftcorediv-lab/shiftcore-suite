// ===== ShiftBuilder main.js ここから =====

import { DASHBOARD_URL } from "./config.js?v=20260807-shadow-1";
import {
  requireShiftBuilderSession,
  getLoginUrl,
  logoutShiftBuilder
} from "./auth.js?v=20260831-logout-1";
import {
  getCurrentShiftBuilderUser,
  getShiftBuilderMonthData,
  createShiftBuilderAssignment,
  archiveShiftBuilderAssignment,
  replaceShiftBuilderAssignment,
  getShiftBuilderAssignmentCandidates,
  sendShiftBuilderPersonnelIcs,
  resolveAuthorizationShadow,
  SHIFTBUILDER_DATA_REVISION_KEY
} from "./api.js?v=20260807-shadow-1";
import { runAuthorizationShadowCheck } from "./authorization-shadow-policy.mjs?v=20260807-shadow-1";
import { mockShiftData } from "./mock-data.js?v=20260801-authfix-1";
import { escapeHtml } from "./utils.js?v=20260801-authfix-1";
import { getPermissionLabel, canEdit } from "./permissions.js?v=20260801-authfix-1";
import { renderSummary } from "./render-summary.js?v=20260801-authfix-1";
import { renderShiftTable } from "./render-shift-table.js?v=20260905-cell-readability-1";
import { buildPersonnelAxisViewModel } from "./personnel-axis-view-model.js?v=20260801-authfix-1";
import { renderPersonnelTable } from "./render-personnel-table.js?v=20260801-authfix-1";
import { getConsecutiveWorkAlert } from "./consecutive-work-alert.js?v=20260801-authfix-1";
import {
  renderSelectedCell,
  resetDetailPanel,
  renderCellPreviewPopover,
  renderPersonnelCellPreviewPopover,
  renderCellActionPopover
} from "./render-detail-panel.js?v=20260905-cell-readability-1";
import {
  setCurrentSession,
  setCurrentUser,
  setCurrentShiftData,
  getCurrentShiftData,
  getCurrentSession,
  getActiveAxis,
  getSelectedCell,
  setActiveAxis,
  setSelectedCell,
  resetSelectedCell
} from "./state.js?v=20260801-authfix-1";
import { elements } from "./dom.js?v=20260801-authfix-1";
import { getMonthShortcutOffset, isTableNavigationKey } from "./keyboard-shortcuts.js?v=20260802-shortcuts-4";
import { requiresAuthRefresh, buildAuthRefreshMessage } from "./auth-refresh-policy.js?v=20260802-shortcuts-2";
import {
  resolvePopoverAnchorTarget,
  shouldClosePersonnelPopoverForExternalRefresh,
  shouldClosePopoverForMissingSelection,
  shouldRefreshActionPopoverForCell,
  wasPopoverAnchorFocused
} from "./async-focus-policy.mjs?v=20260801-authfix-1";
import {
  closeExportMenu,
  openCaseExportMenu,
  openPersonnelExportMenu,
  openPersonnelBulkMenu
} from "./export-menu.js?v=20260903-display-labels-1";
import {
  buildPersonnelExportFilename,
  buildPersonnelIcs
} from "./export-utils.mjs?v=20260902-overnight-1";
import { getRequestedOffState } from "./availability-policy.mjs?v=20260801-authfix-1";
import {
  getAssignmentId,
  getInternalUserId
} from "./record-normalizers.mjs?v=20260801-authfix-1";
import {
  assertMutationSession,
  isMutationSessionRequiredError,
  restoreAssignedSnapshot
} from "./mutation-session-policy.mjs?v=20260903-display-labels-1";

let assignmentCandidates = [];
let previousMonthShiftData = null;
let isPreviousMonthDataAvailable = false;
let activePopoverMode = "";
let activePopoverKey = null;
let activePopoverAnchor = null;
let pendingActionPopoverFocus = null;
let isRenderingShiftView = false;
let externalDataRefreshTimer = null;
let externalDataRefreshPending = false;
let isExternalDataRefreshRunning = false;
let authRefreshRequired = false;
const IS_DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";
const HOWTO_OPEN_STORAGE_KEY = "shiftbuilder-howto-open-v2";

function mountAccountMenuLogout() {
  const panel = document.querySelector(".shiftcore-account-menu-panel");

  if (!panel) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountAccountMenuLogout, { once: true });
    }
    return;
  }

  if (panel.querySelector("[data-shiftbuilder-logout]")) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "shiftcore-account-menu-logout";
  button.dataset.shiftbuilderLogout = "true";
  button.textContent = "ログアウト";

  button.addEventListener("click", async () => {
    if (button.disabled) {
      return;
    }

    button.disabled = true;
    button.textContent = "ログアウト中...";

    try {
      await logoutShiftBuilder();
    } catch (error) {
      console.error("[ShiftBuilder] logout error:", error);
      button.disabled = false;
      button.textContent = "ログアウト";
      setStatus("ログアウトに失敗しました。通信状態を確認して再度お試しください。");
    }
  });

  panel.appendChild(button);
}

async function requireMutationSession() {
  let session = getCurrentSession();

  if (!session?.isLoggedIn || !session?.idToken) {
    session = await requireShiftBuilderSession();
    setCurrentSession(session);
  }

  return assertMutationSession(session);
}

function showMutationFailure(error) {
  const message = error?.message || String(error);

  if (isMutationSessionRequiredError(error)) {
    renderNoLogin(error.session || {});
  } else if (requiresAuthRefresh(message)) {
    showAuthRefreshPrompt(message);
  } else {
    setStatus(message);
  }

  if (elements.assignmentCandidateStatus) {
    elements.assignmentCandidateStatus.textContent = message;
  }
}

function showAuthRefreshPrompt(detail = "") {
  authRefreshRequired = true;
  if (elements.reloadBtn) {
    elements.reloadBtn.textContent = "再読み込みして再接続";
  }
  setStatus(buildAuthRefreshMessage(detail));
}

function buildPersonnelIcsMailRecipients(people, shiftData) {
  return (Array.isArray(people) ? people : []).map((person) => ({
    internalUserId: person.id,
    displayName: person.displayName,
    filename: buildPersonnelExportFilename(person, shiftData.month, "ics"),
    icsContent: buildPersonnelIcs(person, shiftData)
  }));
}

async function sendPersonnelIcsEmails(people, shiftData) {
  const targets = (Array.isArray(people) ? people : []).filter(
    (person) => String(person.email || "").trim() && Number(person.assignmentCount || 0) > 0
  );
  if (!targets.length) {
    setStatus("メール送信できるアサイン済み人員がいません。");
    return;
  }

  const names = targets.length === 1
    ? targets[0].displayName
    : `${targets.length}名`;
  if (!window.confirm(`${shiftData.month}のICSを${names}へメール送信します。よろしいですか？`)) {
    setStatus("ICSメール送信をキャンセルしました。");
    return;
  }

  const session = getCurrentSession();
  if (!session?.idToken) {
    setStatus("メール送信には再ログインが必要です。");
    return;
  }

  setLoading(true, `ICSを${names}へ送信中...`);
  setStatus(`ICSを${names}へ送信中...`);
  try {
    const result = await sendShiftBuilderPersonnelIcs(session.idToken, {
      targetMonth: shiftData.month,
      recipients: buildPersonnelIcsMailRecipients(targets, shiftData)
    });
    if (!result || result.success !== true) {
      throw new Error(result?.message || "ICSメール送信に失敗しました。");
    }
    const sentCount = Number(result.sentCount || 0);
    const skippedCount = Number(result.skippedCount || 0);
    setStatus(
      `ICSメールを${sentCount}名へ送信しました。` +
      (skippedCount ? ` 未送信 ${skippedCount}名。` : "")
    );
  } catch (error) {
    console.error("[ShiftBuilder] ICS mail error:", error);
    setStatus(error.message || String(error));
  } finally {
    setLoading(false);
  }
}

function initializeHowto() {
  if (!elements.shiftbuilderHowto) {
    return;
  }

  let savedState = null;

  try {
    savedState = window.localStorage.getItem(HOWTO_OPEN_STORAGE_KEY);
  } catch (error) {
    console.warn("[ShiftBuilder] how-to state could not be restored:", error);
  }

  elements.shiftbuilderHowto.open = savedState === "true";
  elements.shiftbuilderHowto.addEventListener("toggle", () => {
    try {
      window.localStorage.setItem(
        HOWTO_OPEN_STORAGE_KEY,
        String(elements.shiftbuilderHowto.open)
      );
    } catch (error) {
      console.warn("[ShiftBuilder] how-to state could not be saved:", error);
    }
  });
}

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

  loadShiftData();
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
  if (requiresAuthRefresh(session?.authError)) {
    elements.operatorText.textContent = "認証更新が必要です";
    elements.permissionText.textContent = "再読み込み後にアサイン操作を再開できます";
    elements.permissionBadge.textContent = "更新待ち";
    showAuthRefreshPrompt(session.authError);
    return;
  }

  elements.operatorText.textContent = "未ログイン";
  elements.permissionText.textContent = "シフトを利用するにはログインが必要です";
  elements.permissionBadge.textContent = "未ログイン";

  elements.apiStatusText.textContent = "未実行";
  elements.userNameText.textContent = "-";
  elements.shiftPermissionText.textContent = "-";
  elements.editPermissionText.textContent = "-";

  setStatus(
    `未ログインです。ダッシュボードからログイン後、再度シフトを開いてください。ログインURL: ${getLoginUrl()} / email: ${session.email || "-"} / uid: ${session.uid || "-"}`
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
  elements.permissionText.textContent = `シフト権限：${permissionLabel}`;
  elements.permissionBadge.textContent = permissionLabel;

  elements.userNameText.textContent = displayName;
  elements.shiftPermissionText.textContent = permissionLabel;
  elements.editPermissionText.textContent = editable ? "編集可" : "閲覧のみ";

  setStatus(
    editable
      ? "シフトを利用できます。翌月シフトを自動表示します。"
      : "シフトを閲覧できます。編集権限はありません。"
  );
}

function initializeFilters() {
  if (elements.targetMonthInput && !elements.targetMonthInput.value) {
    elements.targetMonthInput.value = getNextMonthValue();
  }
}

function findCandidateByInternalUserId(internalUserId) {
  return assignmentCandidates.find((candidate) => {
    return getInternalUserId(candidate) === String(internalUserId || "");
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
    family_name:
      assignment?.family_name ||
      assignment?.familyName ||
      candidate?.family_name ||
      candidate?.familyName ||
      "",
    given_name:
      assignment?.given_name ||
      assignment?.givenName ||
      candidate?.given_name ||
      candidate?.givenName ||
      "",
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
    affiliation_type:
      assignment?.affiliation_type ||
      candidate?.affiliation_type ||
      "",
    contract_type:
      assignment?.contract_type ||
      candidate?.contract_type ||
      "",
    grade_role:
      assignment?.grade_role ||
      candidate?.grade_role ||
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
      getAssignmentId(member) === String(pendingAssignmentId)
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

  renderCurrentShiftView({
    changedCellKey: getPopoverKey(caseId, date)
  });

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
      const memberUserId = getInternalUserId(member);

      if (memberUserId !== targetUserId) {
        return;
      }

      matches.push({
        caseId: caseItem.caseId || "",
        caseTitle: caseItem.title || caseItem.store_name || caseItem.caseId || "別案件",
        date: selectedDate,
        assignmentId: getAssignmentId(member),
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

function normalizeAssignmentCandidatesForCell(candidates, selectedCell) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const assignedMembers = Array.isArray(selectedCell?.cell?.assigned)
    ? selectedCell.cell.assigned
    : [];

  const assignedUserIds = assignedMembers.map((member) => {
    return getInternalUserId(member);
  });

  return safeCandidates.map((candidate) => {
    const userId = getInternalUserId(candidate);

    const alreadyAssigned = assignedUserIds.includes(userId);
    const sameDayAssignments = getSameDayAssignmentsForUser(userId, selectedCell);
    const hasSameDayAssignment = sameDayAssignments.length > 0;
    const requestedOffState = getRequestedOffState(
      candidate,
      selectedCell?.dateItem?.date
    );

    const sameDayCaseTitles = sameDayAssignments
      .map((item) => item.caseTitle)
      .filter(Boolean)
      .join(" / ");
    const consecutiveWorkAlert = isPreviousMonthDataAvailable
      ? getConsecutiveWorkAlert({
          previousMonthData: previousMonthShiftData,
          currentMonthData: getCurrentShiftData(),
          internalUserId: userId,
          workDate: selectedCell?.dateItem?.date
        })
      : null;

    let sortRank = 10;
    let buttonLabel = "アサイン";
    let disabled = false;
    let warningText = "";

    if (requestedOffState.requestedOff) {
      sortRank = 85;
      buttonLabel = "相談してアサイン";
      warningText = requestedOffState.memo
        ? `希望休：${requestedOffState.memo}`
        : "希望休";
    }

    if (hasSameDayAssignment) {
      sortRank = 80;
      buttonLabel = "同日あり";
      disabled = true;
      warningText = sameDayCaseTitles
        ? `同日別案件あり：${sameDayCaseTitles}`
        : "同日別案件あり";
    }

    if (alreadyAssigned) {
      sortRank = 90;
      buttonLabel = "アサイン済み";
      disabled = true;
      warningText = "";
    }

    if (!alreadyAssigned && (consecutiveWorkAlert || !isPreviousMonthDataAvailable)) {
      warningText = [
        warningText,
        consecutiveWorkAlert?.message || "前月末からの連勤を確認できません"
      ]
        .filter(Boolean)
        .join(" / ");
    }

    return {
      ...candidate,
      has_same_day_assignment: hasSameDayAssignment,
      hasSameDayAssignment: hasSameDayAssignment,
      same_day_assignments: sameDayAssignments,
      sameDayAssignments: sameDayAssignments,
      conflict_reason: warningText,
      conflictReason: warningText,
      uiState: {
        alreadyAssigned,
        hasSameDayAssignment,
        disabled,
        buttonLabel,
        warningText,
        sortRank,
        consecutiveWorkAlert
      }
    };
  }).sort((candidateA, candidateB) => {
    return (
      Number(candidateA.uiState?.sortRank || 0) -
      Number(candidateB.uiState?.sortRank || 0)
    );
  });
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
      if (activePopoverMode === "personnel") {
        hideCellPopover({ restoreFocus: true });
        return;
      }

      hideCellPopover({
        resetSelection: true,
        statusMessage: "セル選択を解除しました。",
        restoreFocus: true,
      });
      return;
    }

    const assignButton = event.target.closest(".assign-candidate-btn");

    if (assignButton) {
      rememberActionPopoverFocus(assignButton);
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

    const personnelAssignButton = event.target.closest(".personnel-assign-option-btn");

    if (personnelAssignButton) {
      personnelAssignButton.disabled = true;
      personnelAssignButton.textContent = "反映中...";
      createPersonnelAxisAssignment(
        personnelAssignButton.dataset.caseId || "",
        personnelAssignButton.dataset.date || "",
        personnelAssignButton.dataset.personId || ""
      );
      return;
    }

    const personnelArchiveButton = event.target.closest(".personnel-archive-option-btn");

    if (personnelArchiveButton) {
      personnelArchiveButton.disabled = true;
      personnelArchiveButton.textContent = "解除中...";
      archivePersonnelAxisAssignment(
        personnelArchiveButton.dataset.caseId || "",
        personnelArchiveButton.dataset.date || "",
        personnelArchiveButton.dataset.assignmentId || ""
      );
      return;
    }

    const archiveButton = event.target.closest(".archive-assignment-btn");

    if (archiveButton) {
      rememberActionPopoverFocus(archiveButton);
      archiveButton.disabled = true;
      archiveButton.textContent = "解除中...";

      const assignmentId = archiveButton.dataset.assignmentId || "";

      archiveAssignmentFromButton(assignmentId);
    }
  });

  popover.addEventListener("keydown", (event) => {
    handleActionPopoverKeydown(event, popover);
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

function getActionPopoverButtons(popover) {
  if (!popover) {
    return [];
  }

  return Array.from(
    popover.querySelectorAll(
      ".cell-popover-close-btn, .cell-popover-close, .archive-assignment-btn:not(:disabled), .assign-candidate-btn:not(:disabled), .personnel-assign-option-btn:not(:disabled), .personnel-archive-option-btn:not(:disabled)"
    )
  ).filter((button) => {
    return button instanceof HTMLButtonElement && !button.disabled;
  });
}

function describeActionPopoverFocus(button) {
  if (!(button instanceof HTMLButtonElement)) {
    return null;
  }

  if (button.classList.contains("assign-candidate-btn")) {
    return {
      kind: "assign",
      internalUserId: button.dataset.internalUserId || "",
      replaceAssignmentId: button.dataset.replaceAssignmentId || ""
    };
  }

  if (button.classList.contains("archive-assignment-btn")) {
    return {
      kind: "archive",
      assignmentId: button.dataset.assignmentId || ""
    };
  }

  return null;
}

function rememberActionPopoverFocus(button) {
  pendingActionPopoverFocus = describeActionPopoverFocus(button);
}

function getFocusedActionPopoverTarget() {
  const popover = document.getElementById("shiftbuilderCellPopover");
  const activeElement = document.activeElement;

  if (
    !popover ||
    popover.hidden ||
    !(activeElement instanceof HTMLButtonElement) ||
    !popover.contains(activeElement)
  ) {
    return null;
  }

  return describeActionPopoverFocus(activeElement);
}

function restoreActionPopoverFocus(focusTarget, fallbackCellKey) {
  requestAnimationFrame(() => {
    const popover = document.getElementById("shiftbuilderCellPopover");

    if (popover && !popover.hidden && focusTarget) {
      const nextButton = getActionPopoverButtons(popover).find((button) => {
        if (focusTarget.kind === "assign") {
          return (
            button.classList.contains("assign-candidate-btn") &&
            (button.dataset.internalUserId || "") === focusTarget.internalUserId &&
            (button.dataset.replaceAssignmentId || "") === focusTarget.replaceAssignmentId
          );
        }

        return (
          focusTarget.kind === "archive" &&
          button.classList.contains("archive-assignment-btn") &&
          (button.dataset.assignmentId || "") === focusTarget.assignmentId
        );
      });

      if (nextButton) {
        focusPopoverElement(nextButton);
        return;
      }

      const primaryButton = getPrimaryCandidateButton(popover);

      if (primaryButton) {
        focusPopoverElement(primaryButton);
        return;
      }
    }

    if (fallbackCellKey?.caseId && fallbackCellKey?.date) {
      findRenderedShiftCellButton(
        fallbackCellKey.caseId,
        fallbackCellKey.date
      )?.focus({ preventScroll: true });
    }
  });
}

function getPrimaryCandidateButton(popover) {
  if (!popover) {
    return null;
  }

  const button = popover.querySelector(
    ".assign-candidate-btn:not(:disabled), .personnel-assign-option-btn:not(:disabled)"
  );

  return button instanceof HTMLButtonElement ? button : null;
}

function focusPopoverElement(element) {
  if (!(element instanceof HTMLButtonElement)) {
    return;
  }

  element.focus({
    preventScroll: true
  });

  element.scrollIntoView({
    block: "nearest",
    inline: "nearest"
  });
}

function focusActionPopoverContainer(popover) {
  if (!popover) {
    return;
  }

  popover.setAttribute("tabindex", "-1");

  requestAnimationFrame(() => {
    if (popover.hidden) {
      return;
    }

    const primaryCandidateButton = getPrimaryCandidateButton(popover);

    if (primaryCandidateButton) {
      focusPopoverElement(primaryCandidateButton);
      return;
    }

    popover.focus({
      preventScroll: true
    });
  });
}

function focusPopoverButton(popover, nextIndex) {
  const buttons = getActionPopoverButtons(popover);

  if (!buttons.length) {
    return;
  }

  const safeIndex = Math.min(
    Math.max(nextIndex, 0),
    buttons.length - 1
  );

  focusPopoverElement(buttons[safeIndex]);
}

function movePopoverButtonFocus(popover, currentElement, offset) {
  const buttons = getActionPopoverButtons(popover);

  if (!buttons.length) {
    return;
  }

  const currentIndex = buttons.indexOf(currentElement);

  if (currentIndex < 0) {
    focusPopoverButton(popover, offset >= 0 ? 0 : buttons.length - 1);
    return;
  }

  const nextIndex = Math.min(
    Math.max(currentIndex + offset, 0),
    buttons.length - 1
  );

  focusPopoverButton(popover, nextIndex);
}

function handleActionPopoverKeydown(event, popover) {
  if (!popover || !["action", "personnel"].includes(activePopoverMode)) {
    return;
  }

  const target = event.target;

  if (event.key === "Escape") {
    event.preventDefault();

    if (activePopoverMode === "personnel") {
      hideCellPopover({ restoreFocus: true });
      return;
    }

    closeDetailPanel();
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    movePopoverButtonFocus(popover, target, 1);
    return;
  }

  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    movePopoverButtonFocus(popover, target, -1);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    focusPopoverButton(popover, 0);
    return;
  }

  if (event.key === "End") {
    const buttons = getActionPopoverButtons(popover);

    if (!buttons.length) {
      return;
    }

    event.preventDefault();
    focusPopoverButton(popover, buttons.length - 1);
  }
}

function hideCellPopover(options = {}) {
  const {
    resetSelection = false,
    statusMessage = "",
    restoreFocus = false
  } = options;

  const focusMode = restoreFocus ? activePopoverMode : "";
  const focusKey =
    restoreFocus && activePopoverKey
      ? { ...activePopoverKey }
      : null;

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

  if (restoreFocus && focusMode && focusKey) {
    requestAnimationFrame(() => {
      const cellButton = findRenderedPopoverAnchor(focusMode, focusKey);

      if (cellButton) {
        cellButton.focus({
          preventScroll: true
        });
      }
    });
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
  const normalizedAssignmentCandidates = normalizeAssignmentCandidatesForCell(
    assignmentCandidates,
    found
  );

  popover.className = "cell-popover cell-popover-mode-action";
  popover.innerHTML = renderCellActionPopover(found, normalizedAssignmentCandidates);
  popover.hidden = false;

  activePopoverMode = "action";
  activePopoverKey = getSelectedCellKey(found);
  activePopoverAnchor = anchorElement;

  setPopoverPosition(popover, anchorElement);
  focusActionPopoverContainer(popover);
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

function findRenderedPersonnelCellButton(personId, date) {
  if (!elements.shiftTableBody) {
    return null;
  }

  const escapedPersonId = CSS.escape(String(personId || ""));
  const escapedDate = CSS.escape(String(date || ""));

  return elements.shiftTableBody.querySelector(
    `.personnel-shift-cell[data-person-id="${escapedPersonId}"][data-date="${escapedDate}"]`
  );
}

function findRenderedPopoverAnchor(activeMode, activeKey) {
  const target = resolvePopoverAnchorTarget(activeMode, activeKey);

  if (!target) {
    return null;
  }

  return target.axis === "personnel"
    ? findRenderedPersonnelCellButton(target.id, target.date)
    : findRenderedShiftCellButton(target.id, target.date);
}

function focusFirstShiftCell({ announce = true } = {}) {
  const firstCell = elements.shiftTableBody?.querySelector(
    ".shift-cell, .personnel-shift-cell"
  );

  if (!firstCell) {
    setStatus("フォーカスできるシフトセルがありません。");
    return null;
  }

  firstCell.focus();
  firstCell.scrollIntoView({
    block: "nearest",
    inline: "nearest"
  });

  if (announce) {
    setStatus("シフト表の先頭セルへ移動しました。");
  }

  return firstCell;
}

function getPersonnelAssignmentOptions(internalUserId, workDate) {
  const candidate = findCandidateByInternalUserId(internalUserId);
  const shiftData = getCurrentShiftData();

  if (
    !candidate ||
    !shiftData ||
    hasSameDayAssignmentForUser(internalUserId, {
    dateItem: { date: workDate }
    })
  ) {
    return [];
  }

  return shiftData.cases.flatMap((caseItem) => {
    const cell = caseItem.cells?.[workDate];
    const required = Number(cell?.required || 0);
    const assignedCount = Array.isArray(cell?.assigned) ? cell.assigned.length : 0;

    if (!cell || required <= assignedCount) {
      return [];
    }

    return [{
      caseId: caseItem.caseId,
      title: caseItem.title || caseItem.caseId || "案件名未設定",
      client: caseItem.client || "",
      area: caseItem.area || "",
      assignedCount,
      required
    }];
  });
}

function confirmRequestedOffAssignment(internalUserId, workDate) {
  const candidate = findCandidateByInternalUserId(internalUserId);
  const requestedOffState = getRequestedOffState(candidate, workDate);

  if (!requestedOffState.requestedOff) return false;

  const memo = requestedOffState.memo ? `\n希望休メモ：${requestedOffState.memo}` : "";
  return window.confirm(
    `この日は希望休です。${memo}\n\n本人へ相談し、アサインの了承を得ていますか？`
  ) ? true : null;
}

function getPersonnelCellAssignments(internalUserId, workDate) {
  const shiftData = getCurrentShiftData();
  const targetUserId = String(internalUserId || "");

  if (!shiftData || !targetUserId || !workDate) {
    return [];
  }

  return shiftData.cases.flatMap((caseItem) => {
    const cell = caseItem.cells?.[workDate];

    if (!Array.isArray(cell?.assigned)) {
      return [];
    }

    return cell.assigned
      .filter((member) => {
        const memberUserId = getInternalUserId(member);

        return String(memberUserId) === targetUserId;
      })
      .map((member) => ({
        caseId: caseItem.caseId || "",
        title:
          caseItem.shiftcore_display_name ||
          caseItem.title ||
          caseItem.caseId ||
          "案件名未設定",
        assignmentId: getAssignmentId(member),
        client: caseItem.client || "",
        area: caseItem.area || ""
      }));
  });
}

function getPersonnelExistingAssignments(internalUserId, workDate) {
  return getPersonnelCellAssignments(internalUserId, workDate)
    .filter((assignment) => Boolean(assignment.assignmentId));
}

function getPersonnelPopoverKey(internalUserId, workDate) {
  return {
    personId: String(internalUserId || ""),
    date: String(workDate || "")
  };
}

function isSamePersonnelPopoverKey(keyA, keyB) {
  return (
    keyA?.personId === keyB?.personId &&
    keyA?.date === keyB?.date
  );
}

function previewPersonnelCell(internalUserId, workDate, anchorElement) {
  if (["action", "personnel"].includes(activePopoverMode)) {
    return;
  }

  const candidate = findCandidateByInternalUserId(internalUserId);
  const shiftData = getCurrentShiftData();
  const dateItem = shiftData?.dates?.find((item) => item.date === workDate);
  const assignments = getPersonnelCellAssignments(internalUserId, workDate);
  const consecutiveWorkAlert = isPreviousMonthDataAvailable
    ? getConsecutiveWorkAlert({
        previousMonthData: previousMonthShiftData,
        currentMonthData: shiftData,
        internalUserId,
        workDate
      })
    : null;
  const popover = getOrCreateCellPopover();
  const cellData = anchorElement?.dataset || {};

  popover.className = "cell-popover cell-popover-mode-preview";
  popover.innerHTML = renderPersonnelCellPreviewPopover({
    internalUserId,
    date: workDate,
    dateLabel: [
      dateItem?.label || workDate,
      dateItem?.weekday ? `(${dateItem.weekday})` : ""
    ].join(""),
    displayName:
      cellData.displayName ||
      candidate?.display_name ||
      candidate?.displayName ||
      candidate?.name ||
      internalUserId,
    accountCode:
      cellData.accountCode ||
      candidate?.account_code ||
      candidate?.employee_code ||
      "",
    affiliationType:
      cellData.affiliationType ||
      candidate?.affiliation_type ||
      "",
    contractType:
      cellData.contractType ||
      candidate?.contract_type ||
      "",
    gradeRole:
      cellData.gradeRole ||
      candidate?.grade_role ||
      "",
    baseArea:
      cellData.baseArea ||
      candidate?.base_area ||
      "",
    assignments,
    consecutiveWorkAlert
  });
  popover.hidden = false;
  activePopoverMode = "personnel-preview";
  activePopoverKey = getPersonnelPopoverKey(internalUserId, workDate);
  activePopoverAnchor = anchorElement;
  setPopoverPosition(popover, anchorElement);
}

function leavePersonnelCell(internalUserId, workDate) {
  if (isRenderingShiftView) {
    return;
  }

  if (activePopoverMode !== "personnel-preview") {
    return;
  }

  if (
    !isSamePersonnelPopoverKey(
      activePopoverKey,
      getPersonnelPopoverKey(internalUserId, workDate)
    )
  ) {
    return;
  }

  hideCellPopover();
}

function openPersonnelAssignmentPopover(internalUserId, workDate, anchorElement) {
  const candidate = findCandidateByInternalUserId(internalUserId);
  const requestedOffState = getRequestedOffState(candidate, workDate);
  const options = getPersonnelAssignmentOptions(internalUserId, workDate);
  const existingAssignments = getPersonnelExistingAssignments(internalUserId, workDate);
  const consecutiveWorkAlert = isPreviousMonthDataAvailable
    ? getConsecutiveWorkAlert({
        previousMonthData: previousMonthShiftData,
        currentMonthData: getCurrentShiftData(),
        internalUserId,
        workDate
      })
    : null;
  const popover = getOrCreateCellPopover();
  const displayName =
    anchorElement?.dataset?.displayName ||
    candidate?.display_name ||
    candidate?.displayName ||
    candidate?.name ||
    internalUserId;

  popover.className = "cell-popover cell-popover-mode-action";
  popover.innerHTML = `
    <div class="cell-popover-header">
      <div>
        <div class="cell-popover-title">${escapeHtml(displayName)} / ${escapeHtml(workDate)}</div>
        <div class="cell-popover-meta">案件の追加・解除を行えます。</div>
      </div>
      <button type="button" class="cell-popover-close" data-popover-action="close" aria-label="閉じる">×</button>
    </div>
    ${requestedOffState.requestedOff ? `<div class="candidate-warning">希望休${requestedOffState.memo ? `：${escapeHtml(requestedOffState.memo)}` : ""}です。本人へ相談し、了承後にアサインしてください。</div>` : ""}
    ${consecutiveWorkAlert ? `<div class="candidate-warning">${escapeHtml(consecutiveWorkAlert.message)}</div>` : ""}
    ${!isPreviousMonthDataAvailable ? '<div class="candidate-warning">前月末からの連勤を確認できません</div>' : ""}
    ${existingAssignments.length ? `
      <div class="cell-popover-section-title">配置済み</div>
      <div class="candidate-card-list">
        ${existingAssignments.map((assignment) => `
          <button
            type="button"
            class="secondary-button personnel-archive-option-btn"
            data-case-id="${escapeHtml(assignment.caseId)}"
            data-date="${escapeHtml(workDate)}"
            data-assignment-id="${escapeHtml(assignment.assignmentId)}"
          >
            ${escapeHtml(assignment.title)} を解除
          </button>
        `).join("")}
      </div>
    ` : ""}
    <div class="cell-popover-section-title">追加できる案件</div>
    <div class="candidate-card-list">
      ${options.length ? options.map((option) => `
        <button
          type="button"
          class="secondary-button personnel-assign-option-btn"
          data-person-id="${escapeHtml(internalUserId)}"
          data-case-id="${escapeHtml(option.caseId)}"
          data-date="${escapeHtml(workDate)}"
        >
          ${escapeHtml(option.title)}（${option.assignedCount}/${option.required}）
        </button>
      `).join("") : `<div class="empty-note">この人員を追加できる未充足案件はありません。</div>`}
    </div>
  `;
  popover.hidden = false;
  activePopoverMode = "personnel";
  activePopoverKey = getPersonnelPopoverKey(internalUserId, workDate);
  activePopoverAnchor = anchorElement;
  setPopoverPosition(popover, anchorElement);
  focusActionPopoverContainer(popover);
}

async function archivePersonnelAxisAssignment(caseId, workDate, assignmentId) {
  const found = findShiftCell(caseId, workDate);

  if (!found) {
    setStatus("解除対象の案件セルを取得できませんでした。");
    return;
  }

  hideCellPopover({ resetSelection: false });
  setSelectedCell(found);
  await archiveAssignmentFromButton(assignmentId);
}

async function createPersonnelAxisAssignment(caseId, workDate, internalUserId) {
  const found = findShiftCell(caseId, workDate);

  if (!found) {
    setStatus("選択した案件セルを取得できませんでした。");
    return;
  }

  hideCellPopover({ resetSelection: false });
  setSelectedCell(found);
  await createAssignmentFromSelectedCell(internalUserId);
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
  // 先行保存が完了しても、現在操作中の別セルの候補ボタンを優先して復元する。
  const focusTarget = getFocusedActionPopoverTarget() || pendingActionPopoverFocus;
  pendingActionPopoverFocus = null;
  const anchorElement =
    findRenderedShiftCellButton(selectedKey.caseId, selectedKey.date) ||
    activePopoverAnchor;

  if (!anchorElement) {
    hideCellPopover();
    return;
  }

  renderActionPopover(selectedCell, anchorElement);

  if (focusTarget) {
    restoreActionPopoverFocus(focusTarget, selectedKey);
  }
}

function capturePopoverRerenderState() {
  const target = resolvePopoverAnchorTarget(
    activePopoverMode,
    activePopoverKey
  );

  if (!target) {
    return null;
  }

  return {
    mode: activePopoverMode,
    key: { ...activePopoverKey },
    target,
    restoreAnchorFocus: wasPopoverAnchorFocused(
      document.activeElement,
      activePopoverAnchor
    )
  };
}

function reanchorActivePopover(rerenderState = null) {
  const currentTarget = resolvePopoverAnchorTarget(
    activePopoverMode,
    activePopoverKey
  );
  const anchorElement = findRenderedPopoverAnchor(
    activePopoverMode,
    activePopoverKey
  );
  const popover = document.getElementById("shiftbuilderCellPopover");

  if (!currentTarget || !anchorElement || !popover || popover.hidden) {
    return;
  }

  activePopoverAnchor = anchorElement;
  setPopoverPosition(popover, anchorElement);

  if (
    !rerenderState?.restoreAnchorFocus ||
    rerenderState.mode !== activePopoverMode ||
    rerenderState.target.axis !== currentTarget.axis ||
    rerenderState.target.id !== currentTarget.id ||
    rerenderState.target.date !== currentTarget.date
  ) {
    return;
  }

  requestAnimationFrame(() => {
    const latestTarget = resolvePopoverAnchorTarget(
      activePopoverMode,
      activePopoverKey
    );
    const focusedElement = document.activeElement;

    if (
      !latestTarget ||
      latestTarget.axis !== currentTarget.axis ||
      latestTarget.id !== currentTarget.id ||
      latestTarget.date !== currentTarget.date ||
      (
        focusedElement &&
        focusedElement !== document.body &&
        focusedElement !== document.documentElement
      )
    ) {
      return;
    }

    findRenderedPopoverAnchor(
      activePopoverMode,
      activePopoverKey
    )?.focus({ preventScroll: true });
  });
}

function refreshActionPopoverForChangedCell(caseId, date) {
  const changedCellKey = getPopoverKey(caseId, date);

  if (
    shouldRefreshActionPopoverForCell(
      activePopoverMode,
      activePopoverKey,
      changedCellKey
    )
  ) {
    refreshActiveActionPopover();
  }
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
  if (isRenderingShiftView) {
    return;
  }

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
    ? cell.assigned.map((member) => getInternalUserId(member))
    : [];

  const normalizedCandidates = normalizeAssignmentCandidatesForCell(
    assignmentCandidates,
    selectedCell
  );

  elements.assignmentCandidateList.innerHTML = normalizedCandidates.map((candidate) => {
    const userId = getInternalUserId(candidate);
    const separatedName = [
      candidate.family_name || candidate.familyName || "",
      candidate.given_name || candidate.givenName || ""
    ].filter(Boolean).join(" ");
    const displayName =
      separatedName ||
      candidate.display_name ||
      candidate.displayName ||
      candidate.name ||
      userId ||
      "氏名未設定";

    const accountCode =
      candidate.account_code ||
      candidate.employee_code ||
      "";

    const affiliationType = candidate.affiliation_type || "所属未設定";
    const contractType = candidate.contract_type || "契約未設定";
    const gradeRole = candidate.grade_role || "等級・役割未設定";
    const baseArea = candidate.base_area || "拠点未設定";

    const alreadyAssigned = assignedUserIds.includes(String(userId));
    const sameDayAssignments = getSameDayAssignmentsForUser(userId, selectedCell);
    const hasSameDayAssignment = sameDayAssignments.length > 0;

    const requestedOffState = getRequestedOffState(
      candidate,
      selectedCell?.dateItem?.date
    );
    const warningText = candidate.uiState?.warningText || (hasSameDayAssignment
      ? `同日別案件あり：${sameDayAssignments.map((item) => item.caseTitle).join(" / ")}`
      : "");

    const buttonLabel = alreadyAssigned
      ? "アサイン済み"
      : hasSameDayAssignment
        ? "同日あり"
        : requestedOffState.requestedOff
          ? "希望休"
          : "アサイン";

    const isDisabled =
      alreadyAssigned ||
      hasSameDayAssignment ||
      requestedOffState.requestedOff;
    const consecutiveAlertLevel = candidate.uiState?.consecutiveWorkAlert?.level || "";

    return `
      <div class="candidate-card ${alreadyAssigned ? "is-assigned" : ""} ${hasSameDayAssignment ? "is-conflict" : ""} ${consecutiveAlertLevel ? `is-consecutive-${escapeHtml(consecutiveAlertLevel)}` : ""}">
        <div class="candidate-card-main">
          <div class="candidate-name">${escapeHtml(displayName)}</div>
          <div class="candidate-meta">
            ${escapeHtml(accountCode || "社員コードなし")} / ${escapeHtml(userId)}
          </div>
          <div class="candidate-meta">
            ${escapeHtml(affiliationType)} / ${escapeHtml(contractType)} / ${escapeHtml(gradeRole)} / ${escapeHtml(baseArea)}
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

function renderCurrentShiftView(options = {}) {
  const changedCellKey = options.changedCellKey || null;
  const popoverRerenderState = capturePopoverRerenderState();
  const shiftData = getCurrentShiftData();

  if (!shiftData) {
    return;
  }

  renderSummary(shiftData, {
    requiredTotalText: elements.requiredTotalText,
    assignedTotalText: elements.assignedTotalText,
    shortageTotalText: elements.shortageTotalText,
    completionRateText: elements.completionRateText
  });

  const activeAxis = getActiveAxis();

  syncAxisControls(activeAxis);

  if (activeAxis === "personnel") {
    const personnelViewModel = buildPersonnelAxisViewModel(
      shiftData,
      assignmentCandidates,
      previousMonthShiftData,
      isPreviousMonthDataAvailable
    );

    if (elements.shiftTable) {
      elements.shiftTable.style.minWidth = `${170 + personnelViewModel.dates.length * 40}px`;
    }

    isRenderingShiftView = true;

    try {
      renderPersonnelTable(personnelViewModel, {
        shiftTableHead: elements.shiftTableHead,
        shiftTableBody: elements.shiftTableBody
      }, {
        onSelectCell: openPersonnelAssignmentPopover,
        onPreviewCell: previewPersonnelCell,
        onLeaveCell: leavePersonnelCell,
        onCloseCell: () => hideCellPopover(),
        onOpenRowMenu: (personId, anchor, point) => {
          const person = personnelViewModel.people.find((item) => item.id === personId);

          if (!person) {
            setStatus("出力対象の人員を取得できませんでした。");
            return;
          }

          openPersonnelExportMenu({
            anchor,
            point,
            person,
            shiftData,
            onStatus: setStatus,
            onSendIcs: (targetPerson) => {
              sendPersonnelIcsEmails([targetPerson], shiftData);
            }
          });
        },
        onOpenBulkMenu: (anchor, point) => {
          openPersonnelBulkMenu({
            anchor,
            point,
            people: personnelViewModel.people,
            shiftData,
            onStatus: setStatus,
            onSendAllIcs: (targets) => {
              sendPersonnelIcsEmails(targets, shiftData);
            }
          });
        }
      });
    } finally {
      isRenderingShiftView = false;
    }
  } else {
    elements.shiftTable?.style.removeProperty("min-width");

    isRenderingShiftView = true;

    try {
      renderShiftTable(
        shiftData,
        {
          shiftTableHead: elements.shiftTableHead,
          shiftTableBody: elements.shiftTableBody
        },
        {
          onSelectCell: selectShiftCell,
          onPreviewCell: previewShiftCell,
          onLeaveCell: leaveShiftCell,
          onOpenRowMenu: (caseId, anchor, point) => {
            const caseItem = shiftData.cases.find(
              (item) => String(item.caseId) === String(caseId)
            );

            if (!caseItem) {
              setStatus("出力対象の案件を取得できませんでした。");
              return;
            }

            openCaseExportMenu({
              anchor,
              point,
              caseItem,
              shiftData,
              onStatus: setStatus
            });
          }
        }
      );
    } finally {
      isRenderingShiftView = false;
    }
  }

  const selectedCell = getSelectedCell();

  if (activeAxis === "case" && selectedCell) {
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

  if (
    activeAxis === "case" &&
    shouldRefreshActionPopoverForCell(
      activePopoverMode,
      activePopoverKey,
      changedCellKey
    )
  ) {
    refreshActiveActionPopover();
  } else {
    reanchorActivePopover(popoverRerenderState);
  }
}

function syncAxisControls(axis) {
  const isPersonnelAxis = axis === "personnel";

  elements.caseAxisTab?.classList.toggle("is-active", !isPersonnelAxis);
  elements.personnelAxisTab?.classList.toggle("is-active", isPersonnelAxis);
  elements.caseAxisTab?.setAttribute("aria-selected", String(!isPersonnelAxis));
  elements.personnelAxisTab?.setAttribute("aria-selected", String(isPersonnelAxis));
  elements.shiftTable?.classList.toggle("personnel-axis-table", isPersonnelAxis);

  if (elements.shiftTableTitle) {
    elements.shiftTableTitle.textContent = isPersonnelAxis
      ? "人員 × 日付"
      : "案件 × 日付";
  }

  if (elements.shiftTableHint) {
    elements.shiftTableHint.textContent = isPersonnelAxis
      ? "実際のアサインを人員ごとに表示します。未配置は勤務可能を意味しません。"
      : "案件ごとの必要人数とアサイン状況を日別に確認します。";
  }
}

function switchAxis(axis) {
  closeExportMenu();
  const nextAxis = axis === "personnel" ? "personnel" : "case";
  const currentAxis = getActiveAxis();

  if (nextAxis === currentAxis) {
    activateShiftTableShortcuts();
    return;
  }

  hideCellPopover({
    resetSelection: nextAxis === "personnel"
  });
  setActiveAxis(nextAxis);
  syncAxisControls(nextAxis);
  renderCurrentShiftView();
  activateShiftTableShortcuts();
}

function activateShiftTableShortcuts() {
  requestAnimationFrame(() => focusFirstShiftCell({ announce: false }));
}

async function loadAssignmentCandidates(session, resultPromise = null) {
  if (!session || !session.isLoggedIn || !session.idToken) {
    assignmentCandidates = [];
    renderAssignmentCandidateCards();
    refreshActiveActionPopover();

    if (getActiveAxis() === "personnel") {
      renderCurrentShiftView();
    }
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

    const result = await (resultPromise || getShiftBuilderAssignmentCandidates(session.idToken, {
      targetMonth: targetMonth,
      area: area
    }));

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

    if (getActiveAxis() === "personnel") {
      renderCurrentShiftView();
    }
  } catch (error) {
    console.error("[ShiftBuilder] assignment candidates error:", error);

    assignmentCandidates = [];

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent =
        error.message || String(error);
    }

    renderAssignmentCandidateCards();
    refreshActiveActionPopover();

    if (getActiveAxis() === "personnel") {
      renderCurrentShiftView();
    }
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
    statusMessage: "セル選択を解除しました。",
    restoreFocus: true
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

async function loadShiftData(options = {}) {
  const reloadCandidates = options.reloadCandidates !== false;
  const silent = options.silent === true;
  const preserveSelectedCell = options.preserveSelectedCell === true;
  const preservePopoverInteraction =
    options.preservePopoverInteraction === true;
  const changedCellKey = options.changedCellKey || null;
  const suppressStatus = options.suppressStatus === true;
  const initialSelectedKey = getSelectedCellKey(getSelectedCell());

  const selectedArea = elements.areaSelect?.value || "all";
  const selectedMonth =
    elements.targetMonthInput?.value ||
    getNextMonthValue();

  let apiResult = null;
  const shiftDataSource = IS_DEMO_MODE ? "demo" : "api";
  let candidateRequest = null;
  let previousMonthRequest = null;

  try {
    if (!silent) {
      setLoading(
        true,
        IS_DEMO_MODE
          ? "ShiftBuilderデモデータを準備中..."
          : "ShiftBuilder月次データAPIを確認中..."
      );
    }

    if (IS_DEMO_MODE) {
      apiResult = {
        success: true,
        data: {
          ...mockShiftData,
          month: selectedMonth,
          area: selectedArea
        }
      };
    } else {
      const session = options.session || await requireShiftBuilderSession();

      if (!session.isLoggedIn) {
        renderNoLogin(session);
        return;
      }

      setCurrentSession(session);

      // 月次データと候補者は独立しているため、実データ時だけ並列で取得する。
      candidateRequest = reloadCandidates
        ? getShiftBuilderAssignmentCandidates(session.idToken, {
            targetMonth: selectedMonth,
            area: selectedArea,
            bypassCache: options.bypassCache === true
          })
        : null;

      previousMonthRequest = getShiftBuilderMonthData(session.idToken, {
        targetMonth: shiftMonthValue(selectedMonth, -1),
        area: selectedArea,
        bypassCache: options.bypassCache === true
      });

      apiResult = await getShiftBuilderMonthData(session.idToken, {
        targetMonth: selectedMonth,
        area: selectedArea,
        bypassCache: options.bypassCache === true
      });

      if (!apiResult || apiResult.success !== true) {
        throw new Error(apiResult?.message || "月次シフトデータAPIの取得に失敗しました");
      }
    }
  } catch (error) {
    console.error("[ShiftBuilder] month data API error:", error);

    if (!suppressStatus) {
      setStatus(`月次データAPI確認エラー：${error.message || String(error)}`);
    }
    return;
  } finally {
    if (!silent) {
      setLoading(false);
    }
  }

  const apiData = apiResult?.data;

  const hasValidApiData =
    apiData &&
    Array.isArray(apiData.dates) &&
    Array.isArray(apiData.cases);

  if (!hasValidApiData) {
    if (!suppressStatus) {
      setStatus("月次データAPIの応答形式が不正なため、シフト表を更新できませんでした。");
    }
    return;
  }

  const shiftData = {
    ...apiData,
    month: apiData.month || selectedMonth,
    area: apiData.area || selectedArea
  };

  previousMonthShiftData = null;
  isPreviousMonthDataAvailable = false;

  if (previousMonthRequest) {
    try {
      const previousMonthResult = await previousMonthRequest;
      const previousMonthData = previousMonthResult?.data;

      if (
        previousMonthResult?.success === true &&
        Array.isArray(previousMonthData?.dates) &&
        Array.isArray(previousMonthData?.cases)
      ) {
        previousMonthShiftData = {
          ...previousMonthData,
          month: previousMonthData.month || shiftMonthValue(selectedMonth, -1),
          area: previousMonthData.area || selectedArea
        };
        isPreviousMonthDataAvailable = true;
      } else {
        console.warn("[ShiftBuilder] previous month data was unavailable for consecutive-work alerts");
      }
    } catch (error) {
      console.warn("[ShiftBuilder] previous month data request failed for consecutive-work alerts:", error);
    }
  }

  setCurrentShiftData(shiftData);

  if (reloadCandidates && !preservePopoverInteraction) {
    assignmentCandidates = [];
  }

  const selectedKey = preservePopoverInteraction
    ? getSelectedCellKey(getSelectedCell()) || initialSelectedKey
    : initialSelectedKey;

  if (!preservePopoverInteraction) {
    hideCellPopover();
  }

  if (preserveSelectedCell && selectedKey?.caseId && selectedKey?.date) {
    const restored = findShiftCell(selectedKey.caseId, selectedKey.date);

    if (restored) {
      setSelectedCell(restored);
    } else {
      resetSelectedCell();

      if (
        shouldClosePopoverForMissingSelection(
          preserveSelectedCell,
          selectedKey,
          restored
        )
      ) {
        hideCellPopover({ resetSelection: false });
      }
    }
  } else {
    resetSelectedCell();
  }

  renderCurrentShiftView({ changedCellKey });

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
        "デモモードのサンプルデータを表示しています。実データの確認には使用しないでください。"
      );
    }
  }

  const currentSession = getCurrentSession();

  if (
    reloadCandidates &&
    shiftDataSource === "api" &&
    currentSession?.isLoggedIn
  ) {
    await loadAssignmentCandidates(currentSession, candidateRequest);
  } else {
    renderAssignmentCandidateCards();
  }

  if (!silent && options.activateShortcuts !== false) {
    requestAnimationFrame(() => focusFirstShiftCell({ announce: false }));
  }
}

function scheduleExternalDataRefresh() {
  externalDataRefreshPending = true;

  if (
    document.visibilityState === "hidden" ||
    isExternalDataRefreshRunning
  ) {
    return;
  }

  if (externalDataRefreshTimer) {
    clearTimeout(externalDataRefreshTimer);
  }

  externalDataRefreshTimer = setTimeout(refreshAfterExternalDataChange, 120);
}

async function refreshAfterExternalDataChange() {
  externalDataRefreshTimer = null;

  if (
    !externalDataRefreshPending ||
    document.visibilityState === "hidden" ||
    isExternalDataRefreshRunning
  ) {
    return;
  }

  externalDataRefreshPending = false;
  isExternalDataRefreshRunning = true;

  try {
    if (shouldClosePersonnelPopoverForExternalRefresh(activePopoverMode)) {
      hideCellPopover({ resetSelection: false });
    }

    await loadShiftData({
      reloadCandidates: true,
      silent: true,
      preserveSelectedCell: true,
      preservePopoverInteraction: true,
      bypassCache: true,
      suppressStatus: true
    });
  } catch (error) {
    console.error("[ShiftBuilder] external data refresh error:", error);
  } finally {
    isExternalDataRefreshRunning = false;

    if (externalDataRefreshPending) {
      scheduleExternalDataRefresh();
    }
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
        return getInternalUserId(member) === targetInternalUserId;
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

  const requestedOffConfirmed = confirmRequestedOffAssignment(
    targetInternalUserId,
    dateItem.date
  );

  if (requestedOffConfirmed === null) {
    setStatus("希望休へのアサインを中止しました。");
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
    const session = await requireMutationSession();

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
      startTime: cell.start_time || "",
      endTime: cell.end_time || "",
      assignmentNote: "ShiftBuilder画面から作成",
      requestedOffConfirmed: requestedOffConfirmed
    });

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
      await loadShiftData({
        reloadCandidates: false,
        silent: true,
        preserveSelectedCell: true,
        preservePopoverInteraction: true,
        changedCellKey: getPopoverKey(caseId, workDate),
        suppressStatus: true
      });
    }

    setStatus(`アサインを保存しました：${caseItem.title} ${dateItem.label} / ${targetInternalUserId}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "アサインを保存しました。";
    }
  } catch (error) {
    console.error("[ShiftBuilder] create assignment error:", error);

    const found = findShiftCell(caseId, workDate);

    if (found?.cell) {
      restoreAssignedSnapshot(found.cell, previousAssigned);

      if (isSelectedCellKey(caseId, workDate)) {
        setSelectedCell(found);
      }

      renderCurrentShiftView({
        changedCellKey: getPopoverKey(caseId, workDate)
      });
    }

    showMutationFailure(error);

    refreshActionPopoverForChangedCell(caseId, workDate);
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
    return getAssignmentId(member) === targetReplaceAssignmentId;
  });

  if (replaceIndex < 0) {
    setStatus("入れ替え対象のアサインが見つかりませんでした。");
    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "入れ替え対象のアサインが見つかりませんでした。";
    }
    return;
  }

  const alreadyAssigned = previousAssigned.some((member) => {
    return getInternalUserId(member) === targetInternalUserId;
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

  const requestedOffConfirmed = confirmRequestedOffAssignment(
    targetInternalUserId,
    dateItem.date
  );

  if (requestedOffConfirmed === null) {
    setStatus("希望休への入れ替えを中止しました。");
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
    const session = await requireMutationSession();

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
      startTime: cell.start_time || "",
      endTime: cell.end_time || "",
      assignmentNote: "ShiftBuilder画面から入れ替え",
      requestedOffConfirmed: requestedOffConfirmed
    });

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
      await loadShiftData({
        reloadCandidates: false,
        silent: true,
        preserveSelectedCell: true,
        preservePopoverInteraction: true,
        changedCellKey: getPopoverKey(caseId, workDate),
        suppressStatus: true
      });
    }

    setStatus(`入れ替えを保存しました：${caseItem.title} ${dateItem.label} / ${targetInternalUserId}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "入れ替えを保存しました。";
    }
  } catch (error) {
    console.error("[ShiftBuilder] replace assignment error:", error);

    const found = findShiftCell(caseId, workDate);

    if (found?.cell) {
      restoreAssignedSnapshot(found.cell, previousAssigned);

      if (isSelectedCellKey(caseId, workDate)) {
        setSelectedCell(found);
      }

      renderCurrentShiftView({
        changedCellKey: getPopoverKey(caseId, workDate)
      });
    }

    try {
      await loadShiftData({
        reloadCandidates: true,
        silent: true,
        preserveSelectedCell: true,
        preservePopoverInteraction: true,
        changedCellKey: getPopoverKey(caseId, workDate),
        suppressStatus: true
      });
    } catch (reloadError) {
      console.error("[ShiftBuilder] replace failure reload error:", reloadError);
    }

    showMutationFailure(error);

    refreshActionPopoverForChangedCell(caseId, workDate);
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
      return getAssignmentId(member) !== String(assignmentId);
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
    const session = await requireMutationSession();

    const result = await archiveShiftBuilderAssignment(
      session.idToken,
      assignmentId
    );

    if (!result || result.success !== true) {
      throw new Error(result?.message || "アサイン解除に失敗しました");
    }

    setStatus(`アサインを解除しました：${assignmentId}`);

    if (elements.assignmentCandidateStatus) {
      elements.assignmentCandidateStatus.textContent = "アサインを解除しました。";
    }

    refreshActionPopoverForChangedCell(caseId, workDate);
  } catch (error) {
    console.error("[ShiftBuilder] archive assignment error:", error);

    const found = findShiftCell(caseId, workDate);

    if (found?.cell) {
      restoreAssignedSnapshot(found.cell, previousAssigned);

      if (isSelectedCellKey(caseId, workDate)) {
        setSelectedCell(found);
      }

      renderCurrentShiftView({
        changedCellKey: getPopoverKey(caseId, workDate)
      });
    }

    showMutationFailure(error);

    refreshActionPopoverForChangedCell(caseId, workDate);
  }
}

async function init() {
  try {
    initializeHowto();
    initializeFilters();
    syncAxisControls(getActiveAxis());

    setLoading(true, "ログイン状態を確認中...");
    setStatus("ログイン状態を確認中...");

    const session = await requireShiftBuilderSession();

    setCurrentSession(session);

    if (!session.isLoggedIn) {
      renderNoLogin(session);
      if (IS_DEMO_MODE) {
        await loadShiftData({ reloadCandidates: false });
      }
      return;
    }

    mountAccountMenuLogout();

    setStatus(`Firebaseログイン確認OK：${session.email}`);

    // Shadow判定は既存の画面表示・実効権限から隔離し、失敗しても初期化を継続する。
    void runAuthorizationShadowCheck(
      session.idToken,
      resolveAuthorizationShadow
    );

    setLoading(true, "ShiftBuilderデータを読み込み中...");
    const [currentUserResult] = await Promise.all([
      getCurrentShiftBuilderUser(session.idToken),
      loadShiftData({ session })
    ]);

    elements.apiStatusText.textContent = "接続OK";

    setCurrentUser(normalizeCurrentUser(currentUserResult));

    renderUser(currentUserResult);
    authRefreshRequired = false;
    if (elements.reloadBtn) {
      elements.reloadBtn.textContent = "再読み込み";
    }

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
  if (authRefreshRequired) {
    window.location.reload();
    return;
  }
  loadShiftData({
    reloadCandidates: true,
    bypassCache: true
  });
});

window.addEventListener("storage", (event) => {
  if (
    event.key !== SHIFTBUILDER_DATA_REVISION_KEY ||
    event.newValue === event.oldValue
  ) {
    return;
  }

  scheduleExternalDataRefresh();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && externalDataRefreshPending) {
    scheduleExternalDataRefresh();
  }
});

elements.prevMonthBtn?.addEventListener("click", () => {
  moveTargetMonth(-1);
});

elements.nextMonthBtn?.addEventListener("click", () => {
  moveTargetMonth(1);
});

elements.targetMonthInput?.addEventListener("change", () => {
  loadShiftData();
});

elements.areaSelect?.addEventListener("change", () => {
  loadShiftData();
});

elements.caseAxisTab?.addEventListener("click", () => {
  switchAxis("case");
});

elements.personnelAxisTab?.addEventListener("click", () => {
  switchAxis("personnel");
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

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTypingTarget =
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  const isTableCell = target instanceof HTMLElement && target.matches(".shift-cell, .personnel-shift-cell");
  const isManagedOverlay = target instanceof HTMLElement && Boolean(target.closest("#shiftbuilderCellPopover, .export-menu"));

  if (
    !isTableNavigationKey(event.key) ||
    isTypingTarget ||
    isTableCell ||
    isManagedOverlay ||
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.isComposing
  ) {
    return;
  }

  event.preventDefault();
  const firstCell = focusFirstShiftCell({ announce: false });
  firstCell?.dispatchEvent(new KeyboardEvent("keydown", {
    key: event.key,
    bubbles: true,
    cancelable: true
  }));
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isEditing =
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

  if (
    event.key.toLowerCase() !== "h" ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.repeat ||
    isEditing
  ) {
    return;
  }

  if (!elements.shiftbuilderHowto) {
    return;
  }

  event.preventDefault();
  elements.shiftbuilderHowto.open = !elements.shiftbuilderHowto.open;
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isEditing =
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

  if (
    isEditing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.repeat ||
    !["1", "2"].includes(event.key)
  ) {
    return;
  }

  event.preventDefault();
  switchAxis(event.key === "1" ? "case" : "personnel");
});

document.addEventListener("click", (event) => {
  const popover = document.getElementById("shiftbuilderCellPopover");

  if (popover && popover.contains(event.target)) {
    return;
  }

  if (event.target.closest(".shift-cell, .personnel-shift-cell")) {
    return;
  }

  if (activePopoverMode === "action" || activePopoverMode === "personnel") {
    hideCellPopover({
      resetSelection: true,
      restoreFocus: true
    });
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const tagName = String(target?.tagName || "").toLowerCase();
  const isTypingTarget =
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    target?.isContentEditable === true;

  if (event.key === "Escape" && activePopoverMode === "action") {
    event.preventDefault();
    closeDetailPanel();
    return;
  }

  const monthOffset = getMonthShortcutOffset(event.key);
  if (!isTypingTarget && monthOffset !== 0 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    moveTargetMonth(monthOffset);
    return;
  }

  if (!isTypingTarget && event.key.toLowerCase() === "s") {
    event.preventDefault();
    focusFirstShiftCell();
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
