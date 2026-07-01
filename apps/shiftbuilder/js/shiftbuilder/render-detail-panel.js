// ===== ShiftBuilder render-detail-panel.js ここから =====

import { escapeHtml } from "./utils.js";
import { getCellStatus } from "./render-shift-table.js";
import { CANDIDATE_GROUP_CLASSES } from "./constants.js";

function getAssignedCount(cell) {
  return Array.isArray(cell?.assigned) ? cell.assigned.length : 0;
}

function getRequiredCount(cell) {
  return Number(cell?.required || 0);
}

function getAssignedMemberName(member) {
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

function getCellSummary(found) {
  const { caseItem, dateItem, cell } = found;
  const status = getCellStatus(cell);
  const assignedCount = getAssignedCount(cell);
  const required = getRequiredCount(cell);
  const assignedMembers = Array.isArray(cell?.assigned) ? cell.assigned : [];

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
    canAssign: required > 0
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
    createAssignmentBtn.disabled = !summary.canAssign;
  }

  if (assignmentFormStatus) {
    assignmentFormStatus.textContent =
      summary.canAssign
        ? "候補者カードの「アサイン」で追加できます。"
        : "必要枠のないセルにはアサイン作成できません。";
  }

  if (assignmentCandidateStatus) {
    assignmentCandidateStatus.textContent =
      summary.canAssign
        ? "候補者カードの「アサイン」で、このセルに追加できます。"
        : "必要枠のないセルにはアサインできません。";
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
          summary.canAssign
            ? renderAssignmentCandidatesHtml(assignmentCandidates, assignedMembers)
            : `<div class="empty-note">必要枠のないセルにはアサインできません。</div>`
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

function renderAssignmentCandidatesHtml(candidates, assignedMembers) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return `<div class="empty-note">候補者がいません。</div>`;
  }

  const assignedUserIds = Array.isArray(assignedMembers)
    ? assignedMembers.map((member) => String(member.internal_user_id || member.internalUserId || ""))
    : [];

  return `
    <div class="candidate-card-list">
      ${candidates.map((candidate) => {
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
      }).join("")}
    </div>
  `;
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
