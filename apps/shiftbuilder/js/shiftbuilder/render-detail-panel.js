// ===== ShiftBuilder render-detail-panel.js ここから =====

import { escapeHtml } from "./utils.js";
import { getCellStatus } from "./render-shift-table.js?v=20260714-workflow-1";
import { CANDIDATE_GROUP_CLASSES } from "./constants.js";

function getAssignedCount(cell) {
  return Array.isArray(cell?.assigned) ? cell.assigned.length : 0;
}

function getRequiredCount(cell) {
  return Number(cell?.required || 0);
}

function getAssignedMemberName(member) {
  const familyName = String(member?.family_name || member?.familyName || "").trim();
  const givenName = String(member?.given_name || member?.givenName || "").trim();
  const fullName = [familyName, givenName].filter(Boolean).join(" ");

  if (fullName) {
    return fullName;
  }

  return (
    member?.name ||
    member?.displayName ||
    member?.display_name ||
    member?.user_name ||
    member?.userName ||
    member?.internal_user_id ||
    member?.internalUserId ||
    "氏名未設定"
  );
}

function getAssignedMemberMeta(member) {
  return (
    member?.assignment_note ||
    member?.note ||
    member?.assignment_status ||
    "メモなし"
  );
}

function getAssignmentId(member) {
  return member?.assignment_id || member?.assignmentId || "";
}

function isPendingAssignedMember(member) {
  const assignmentId = getAssignmentId(member);

  return (
    member?.is_pending === true ||
    member?.isPending === true ||
    member?.assignment_status === "saving" ||
    String(assignmentId).startsWith("PENDING-")
  );
}

function getAssignedMemberSummary(members, maxVisible = 2) {
  const safeMembers = Array.isArray(members) ? members : [];

  if (!safeMembers.length) {
    return "";
  }

  const visibleNames = safeMembers
    .slice(0, maxVisible)
    .map((member) => getAssignedMemberName(member));

  const hiddenCount = safeMembers.length - visibleNames.length;

  if (hiddenCount <= 0) {
    return visibleNames.join(" / ");
  }

  return `${visibleNames.join(" / ")} ほか${hiddenCount}名`;
}

function isDaysModeCell(cell, caseItem) {
  return (
    cell?.is_days_mode === true ||
    cell?.input_mode === "days" ||
    caseItem?.input_mode === "days" ||
    caseItem?.inputMode === "days"
  );
}

function getRequestedDays(caseItem, cell) {
  const value =
    caseItem?.requested_days ??
    caseItem?.requestedDays ??
    cell?.requested_days ??
    0;

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function getAssignedDateCount(caseItem) {
  const cells = caseItem?.cells || {};
  let assignedDateCount = 0;

  Object.keys(cells).forEach((dateKey) => {
    const cell = cells[dateKey] || {};
    const assignedCount = getAssignedCount(cell);

    if (assignedCount > 0) {
      assignedDateCount++;
    }
  });

  return assignedDateCount;
}

function isDaysModeCaseFulfilled(caseItem, cell) {
  const requestedDays = getRequestedDays(caseItem, cell);

  if (requestedDays <= 0) {
    return false;
  }

  return getAssignedDateCount(caseItem) >= requestedDays;
}

function getCandidateActionMode(found) {
  const { caseItem, cell } = found;
  const assignedCount = getAssignedCount(cell);
  const required = getRequiredCount(cell);
  const isDaysMode = isDaysModeCell(cell, caseItem);
  const isCurrentCellAssigned = assignedCount > 0;

  if (required <= 0 && !cell?.assignable_without_case_date) {
    return {
      mode: "blocked",
      message: "必要枠のないセルにはアサインできません。"
    };
  }

  if (isCurrentCellAssigned && required > 0 && assignedCount >= required) {
    return {
      mode: "replace",
      message: "このセルは充足済みです。候補者カードから入れ替えできます。"
    };
  }

  if (isDaysMode && isDaysModeCaseFulfilled(caseItem, cell)) {
    if (isCurrentCellAssigned) {
      return {
        mode: "replace",
        message: "この日数指定案件は充足済みです。既存アサインの入れ替えのみ可能です。"
      };
    }

    return {
      mode: "blocked",
      message: "この日数指定案件は充足済みです。未アサイン日への追加はできません。"
    };
  }

  return {
    mode: "assign",
    message: "候補者カードの「アサイン」で、このセルに追加できます。"
  };
}

function getCellSummary(found) {
  const { caseItem, dateItem, cell } = found;
  const status = getCellStatus(cell);
  const assignedCount = getAssignedCount(cell);
  const required = getRequiredCount(cell);
  const assignedMembers = Array.isArray(cell?.assigned) ? cell.assigned : [];
  const candidateAction = getCandidateActionMode(found);

  return {
    caseTitle: caseItem.title || "案件名未設定",
    client: caseItem.client || "代理店未設定",
    area: caseItem.area || "エリア未設定",
    caseId: caseItem.caseId || "",
    dateLabel: dateItem.label || dateItem.date || "日付未設定",
    weekday: dateItem.weekday || "",
    statusLabel: status.label,
    statusNote: status.note,
    assignedCount,
    required,
    assignedMemberSummary: getAssignedMemberSummary(assignedMembers),
    canAssign: candidateAction.mode === "assign",
    candidateAction
  };
}

export function renderSelectedCell(found, elements) {
  const {
    selectedCellTitle,
    selectedCellSummary,
    assignedMembersList,
    candidateList,
    assignmentCandidateStatus,
    createAssignmentBtn,
    assignmentFormStatus
  } = elements;

  const { cell } = found;
  const summary = getCellSummary(found);

  if (selectedCellTitle) {
    selectedCellTitle.textContent =
      `${summary.caseTitle} / ${summary.dateLabel}(${summary.weekday})`;
  }

  if (selectedCellSummary) {
    selectedCellSummary.textContent =
      `${summary.client} / ${summary.area} / 状態：${summary.statusLabel} / ${summary.assignedCount}/${summary.required}`;
  }

  renderAssignedMembers(cell.assigned || [], {
    assignedMembersList
  });

  renderCandidates(cell.candidates || [], {
    candidateList
  });

  if (createAssignmentBtn) {
    createAssignmentBtn.disabled = summary.candidateAction.mode !== "assign";
  }

  if (assignmentFormStatus) {
    assignmentFormStatus.textContent = summary.candidateAction.message;
  }

  if (assignmentCandidateStatus) {
    assignmentCandidateStatus.textContent = summary.candidateAction.message;
  }
}

export function renderAssignedMembers(members, elements) {
  const { assignedMembersList } = elements;

  if (!assignedMembersList) {
    return;
  }

  if (!members.length) {
    assignedMembersList.innerHTML = `<div class="empty-note">アサイン済メンバーはいません。</div>`;
    return;
  }

  assignedMembersList.innerHTML = members
    .map((member) => renderAssignedMemberCardHtml(member))
    .join("");
}

export function renderCandidates(candidates, elements) {
  const { candidateList } = elements;

  if (!candidateList) {
    return;
  }

  if (!candidates.length) {
    candidateList.innerHTML = `<div class="empty-note">候補者はいません。</div>`;
    return;
  }

  candidateList.innerHTML = candidates
    .map((candidate) => {
      const groupClass = getCandidateGroupClass(candidate.group);

      return `
        <div class="candidate-item ${groupClass}">
          <div class="candidate-name">${escapeHtml(candidate.name || "氏名未設定")}</div>
          <div class="candidate-meta">${escapeHtml(candidate.group || "区分なし")} / ${escapeHtml(candidate.reason || "理由なし")}</div>
        </div>
      `;
    })
    .join("");
}

export function renderCellPreviewPopover(found) {
  const summary = getCellSummary(found);

  return `
    <div class="cell-popover-preview">
      <div class="cell-popover-kicker">
        ${escapeHtml(summary.dateLabel)}${summary.weekday ? `(${escapeHtml(summary.weekday)})` : ""}
      </div>

      <div class="cell-popover-title">
        ${escapeHtml(summary.caseTitle)}
      </div>

      <div class="cell-popover-meta">
        ${escapeHtml(summary.client)} / ${escapeHtml(summary.area)}
      </div>

      <div class="cell-popover-summary-row">
        <span class="cell-popover-status">${escapeHtml(summary.statusLabel)}</span>
        <span class="cell-popover-count">${summary.assignedCount}/${summary.required}</span>
      </div>

      ${
        summary.assignedMemberSummary
          ? `
            <div class="cell-popover-assigned-summary">
              <span class="cell-popover-assigned-label">アサイン済</span>
              <span class="cell-popover-assigned-names">${escapeHtml(summary.assignedMemberSummary)}</span>
            </div>
          `
          : ""
      }
    </div>
  `;
}

export function renderCellActionPopover(found, assignmentCandidates = []) {
  const { cell } = found;
  const summary = getCellSummary(found);
  const assignedMembers = Array.isArray(cell.assigned) ? cell.assigned : [];

  return `
    <div class="cell-popover-action">
      <div class="cell-popover-header">
        <div>
          <div class="cell-popover-kicker">
            ${escapeHtml(summary.dateLabel)}${summary.weekday ? `(${escapeHtml(summary.weekday)})` : ""}
          </div>

          <div class="cell-popover-title">
            ${escapeHtml(summary.caseTitle)}
          </div>

          <div class="cell-popover-meta">
            ${escapeHtml(summary.client)} / ${escapeHtml(summary.area)}
          </div>
        </div>

        <button
          type="button"
          class="secondary-button cell-popover-close-btn"
          data-popover-action="close"
          aria-label="セル詳細を閉じる"
        >
          閉じる
        </button>
      </div>

      <div class="cell-popover-summary-row">
        <span class="cell-popover-status">${escapeHtml(summary.statusLabel)}</span>
        <span class="cell-popover-count">${summary.assignedCount}/${summary.required}</span>
      </div>

      <div class="cell-popover-section">
        <div class="cell-popover-section-title">アサイン済みメンバー</div>
        ${renderAssignedMembersHtml(assignedMembers)}
      </div>

      <div class="cell-popover-section">
        <div class="cell-popover-section-title">アサイン候補者</div>
        ${
          summary.candidateAction.mode === "blocked"
            ? `<div class="empty-note">${escapeHtml(summary.candidateAction.message)}</div>`
            : renderAssignmentCandidatesHtml(
                assignmentCandidates,
                assignedMembers,
                summary.candidateAction.mode
              )
        }
      </div>
    </div>
  `;
}

function renderAssignedMembersHtml(members) {
  if (!members.length) {
    return `<div class="empty-note">アサイン済メンバーはいません。</div>`;
  }

  return `
    <div class="member-list">
      ${members.map((member) => renderAssignedMemberCardHtml(member)).join("")}
    </div>
  `;
}

function renderAssignedMemberCardHtml(member) {
  const assignmentId = getAssignmentId(member);
  const isPending = isPendingAssignedMember(member);
  const memberName = getAssignedMemberName(member);
  const memberMeta = getAssignedMemberMeta(member);

  const buttonLabel = isPending ? "保存中" : "解除";
  const buttonDisabled = isPending || !assignmentId;

  const stateLabel = isPending
    ? "保存中"
    : assignmentId
      ? "解除可能"
      : "ID未取得";

  return `
    <div class="member-card member-card-assigned ${isPending ? "is-pending" : ""}">
      <div class="member-card-main">
        <div class="member-card-head">
          <div class="member-name">${escapeHtml(memberName)}</div>
          <div class="member-state-badge ${isPending ? "is-saving" : ""}">
            ${escapeHtml(stateLabel)}
          </div>
        </div>

        <div class="member-meta">${escapeHtml(memberMeta)}</div>
      </div>

      <div class="member-card-actions">
        <button
          type="button"
          class="secondary-button archive-assignment-btn"
          data-assignment-id="${escapeHtml(assignmentId)}"
          ${buttonDisabled ? "disabled" : ""}
        >
          ${escapeHtml(buttonLabel)}
        </button>
      </div>
    </div>
  `;
}

function normalizeCandidateText(value) {
  return String(value || "").trim();
}

function candidateHasSameDayConflict(candidate) {
  const textValues = [
    candidate?.group,
    candidate?.reason,
    candidate?.status,
    candidate?.candidate_status,
    candidate?.candidateStatus,
    candidate?.availability_status,
    candidate?.availabilityStatus,
    candidate?.conflict_reason,
    candidate?.conflictReason
  ]
    .map(normalizeCandidateText)
    .filter(Boolean)
    .join(" ");

  return (
    candidate?.has_same_day_assignment === true ||
    candidate?.hasSameDayAssignment === true ||
    candidate?.same_day_assigned === true ||
    candidate?.sameDayAssigned === true ||
    candidate?.is_same_day_conflict === true ||
    candidate?.isSameDayConflict === true ||
    textValues.includes("同日") ||
    textValues.includes("同日あり") ||
    textValues.includes("同日別案件") ||
    textValues.includes("同じ日") ||
    textValues.toLowerCase().includes("same day")
  );
}

function candidateLooksUnavailable(candidate) {
  const textValues = [
    candidate?.group,
    candidate?.reason,
    candidate?.status,
    candidate?.candidate_status,
    candidate?.candidateStatus,
    candidate?.availability_status,
    candidate?.availabilityStatus,
    candidate?.assign_status,
    candidate?.assignStatus,
    candidate?.button_label,
    candidate?.buttonLabel,
    candidate?.action_label,
    candidate?.actionLabel,
    candidate?.disabled_reason,
    candidate?.disabledReason
  ]
    .map(normalizeCandidateText)
    .filter(Boolean)
    .join(" ");

  return (
    candidate?.disabled === true ||
    candidate?.is_disabled === true ||
    candidate?.isDisabled === true ||
    candidate?.can_assign === false ||
    candidate?.canAssign === false ||
    candidate?.assignable === false ||
    textValues.includes("アサイン済") ||
    textValues.includes("同日あり") ||
    textValues.includes("同日別案件") ||
    textValues.includes("不可")
  );
}

function getCandidateSortRank(candidate, alreadyAssigned) {
  const uiSortRank = Number(candidate?.uiState?.sortRank);

  if (Number.isFinite(uiSortRank)) {
    return uiSortRank;
  }

  if (alreadyAssigned) {
    return 90;
  }

  if (candidateHasSameDayConflict(candidate)) {
    return 80;
  }

  if (candidateLooksUnavailable(candidate)) {
    return 70;
  }

  return 10;
}

function sortAssignmentCandidates(candidates, assignedUserIds) {
  return [...candidates].sort((a, b) => {
    const aUserId = String(a?.internal_user_id || "");
    const bUserId = String(b?.internal_user_id || "");

    const aAlreadyAssigned = assignedUserIds.includes(aUserId);
    const bAlreadyAssigned = assignedUserIds.includes(bUserId);

    const aRank = getCandidateSortRank(a, aAlreadyAssigned);
    const bRank = getCandidateSortRank(b, bAlreadyAssigned);

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    const aName = normalizeCandidateText(
      a?.display_name ||
        a?.displayName ||
        a?.name ||
        aUserId
    );

    const bName = normalizeCandidateText(
      b?.display_name ||
        b?.displayName ||
        b?.name ||
        bUserId
    );

    return aName.localeCompare(bName, "ja");
  });
}

function renderAssignmentCandidatesHtml(candidates, assignedMembers, actionMode = "assign") {
  if (!Array.isArray(candidates) || !candidates.length) {
    return `<div class="empty-note">候補者がいません。</div>`;
  }

  const safeAssignedMembers = Array.isArray(assignedMembers) ? assignedMembers : [];
  const assignedUserIds = safeAssignedMembers.map((member) => {
    return String(member.internal_user_id || member.internalUserId || "");
  });

  const sortedCandidates = sortAssignmentCandidates(candidates, assignedUserIds);
  
  return `
    <div class="candidate-card-list">
      ${sortedCandidates.map((candidate) => {
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

        const affiliationType = candidate.affiliation_type || "所属未設定";
        const contractType = candidate.contract_type || "契約未設定";
        const gradeRole = candidate.grade_role || "等級・役割未設定";
        const baseArea = candidate.base_area || "拠点未設定";
        const uiState = candidate.uiState || {};
        const alreadyAssigned =
          uiState.alreadyAssigned === true ||
          assignedUserIds.includes(String(userId));
        const hasSameDayConflict =
          uiState.hasSameDayAssignment === true ||
          candidateHasSameDayConflict(candidate);
        const warningText =
          uiState.warningText ||
          candidate.conflict_reason ||
          candidate.conflictReason ||
          "";
        const consecutiveAlertLevel = uiState.consecutiveWorkAlert?.level || "";

        const candidateActions = actionMode === "replace"
          ? renderReplacementCandidateButtons(userId, alreadyAssigned, safeAssignedMembers, uiState)
          : renderAssignCandidateButton(userId, alreadyAssigned, uiState);

        return `
          <div class="candidate-card ${alreadyAssigned ? "is-assigned" : ""} ${hasSameDayConflict ? "is-conflict" : ""} ${consecutiveAlertLevel ? `is-consecutive-${escapeHtml(consecutiveAlertLevel)}` : ""}">
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

            <div class="candidate-card-actions">
              ${candidateActions}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderAssignCandidateButton(userId, alreadyAssigned, uiState = {}) {
  const isDisabled = uiState.disabled === true || alreadyAssigned;
  const buttonLabel =
    uiState.buttonLabel ||
    (alreadyAssigned ? "アサイン済み" : "アサイン");

  return `
    <button
      type="button"
      class="secondary-button assign-candidate-btn"
      data-internal-user-id="${escapeHtml(userId)}"
      ${isDisabled ? "disabled" : ""}
    >
      ${escapeHtml(buttonLabel)}
    </button>
  `;
}

function renderReplacementCandidateButtons(userId, alreadyAssigned, assignedMembers, uiState = {}) {
  if (alreadyAssigned) {
    return `
      <button
        type="button"
        class="secondary-button assign-candidate-btn"
        data-internal-user-id="${escapeHtml(userId)}"
        disabled
      >
        アサイン済み
      </button>
    `;
  }

  if (uiState.disabled === true) {
    return `
      <button
        type="button"
        class="secondary-button assign-candidate-btn"
        data-internal-user-id="${escapeHtml(userId)}"
        disabled
      >
        ${escapeHtml(uiState.buttonLabel || "選択不可")}
      </button>
    `;
  }
  
  const replaceableMembers = assignedMembers.filter((member) => {
    return getAssignmentId(member) && !isPendingAssignedMember(member);
  });

  if (!replaceableMembers.length) {
    return `
      <button
        type="button"
        class="secondary-button assign-candidate-btn"
        data-internal-user-id="${escapeHtml(userId)}"
        disabled
      >
        入れ替え不可
      </button>
    `;
  }

  return replaceableMembers
    .map((member) => {
      const assignmentId = getAssignmentId(member);
      const memberName = getAssignedMemberName(member);
      const buttonLabel =
        replaceableMembers.length === 1
          ? "入れ替え"
          : `${memberName}と入替`;

      return `
        <button
          type="button"
          class="secondary-button assign-candidate-btn replace-candidate-btn"
          data-internal-user-id="${escapeHtml(userId)}"
          data-replace-assignment-id="${escapeHtml(assignmentId)}"
        >
          ${escapeHtml(buttonLabel)}
        </button>
      `;
    })
    .join("");
}

export function resetDetailPanel(elements) {
  const {
    selectedCellTitle,
    selectedCellSummary,
    assignedMembersList,
    candidateList,
    assignmentUserIdInput,
    assignmentCandidateStatus,
    assignmentCandidateList,
    createAssignmentBtn,
    assignmentFormStatus
  } = elements;

  if (assignmentUserIdInput) {
    assignmentUserIdInput.value = "";
  }

  if (createAssignmentBtn) {
    createAssignmentBtn.disabled = true;
  }

  if (assignmentFormStatus) {
    assignmentFormStatus.textContent = "案件×日付セルを選択すると作成できます。";
  }

  if (assignmentCandidateStatus) {
    assignmentCandidateStatus.textContent = "セルを選択すると候補者カードからアサインできます。";
  }

  if (assignmentCandidateList) {
    assignmentCandidateList.innerHTML = `<div class="empty-note">セル未選択</div>`;
  }

  if (selectedCellTitle) {
    selectedCellTitle.textContent = "未選択";
  }

  if (selectedCellSummary) {
    selectedCellSummary.textContent =
      "案件×日付セルを選択すると、候補者やアサイン状況をここに表示します。";
  }

  if (assignedMembersList) {
    assignedMembersList.innerHTML = `<div class="empty-note">未選択</div>`;
  }

  if (candidateList) {
    candidateList.innerHTML = `<div class="empty-note">未選択</div>`;
  }
}

function getCandidateGroupClass(group) {
  return CANDIDATE_GROUP_CLASSES[group] || "";
}

// ===== ShiftBuilder render-detail-panel.js ここまで =====
