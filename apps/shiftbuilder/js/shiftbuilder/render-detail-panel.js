// ===== ShiftBuilder render-detail-panel.js ここから =====

import { escapeHtml } from "./utils.js";
import { getCellStatus } from "./render-shift-table.js";
import { CANDIDATE_GROUP_CLASSES } from "./constants.js";

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

  const { caseItem, dateItem, cell } = found;
  const status = getCellStatus(cell);
  const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;
  const required = Number(cell.required || 0);

  if (selectedCellTitle) {
    selectedCellTitle.textContent = `${caseItem.title} / ${dateItem.label}(${dateItem.weekday})`;
  }

  if (selectedCellSummary) {
    selectedCellSummary.textContent =
      `${caseItem.client} / ${caseItem.area} / 状態：${status.label} / ${assignedCount}/${required}`;
  }

  renderAssignedMembers(cell.assigned || [], {
    assignedMembersList
  });

  renderCandidates(cell.candidates || [], {
    candidateList
  });

  if (createAssignmentBtn) {
    createAssignmentBtn.disabled = Number(cell.required || 0) <= 0;
  }

  if (assignmentFormStatus) {
    assignmentFormStatus.textContent =
      Number(cell.required || 0) > 0
        ? "候補者カードの「アサイン」で追加できます。"
        : "必要枠のないセルにはアサイン作成できません。";
  }

  if (assignmentCandidateStatus) {
    assignmentCandidateStatus.textContent =
      Number(cell.required || 0) > 0
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

  assignedMembersList.innerHTML = members.map((member) => {
    const assignmentId = member.assignment_id || member.assignmentId || "";
    const isPending =
      member.is_pending === true ||
      member.isPending === true ||
      member.assignment_status === "saving" ||
      String(assignmentId).startsWith("PENDING-");

    const buttonLabel = isPending ? "保存中" : "解除";
    const buttonDisabled = isPending || !assignmentId;

    return `
      <div class="member-card ${isPending ? "is-pending" : ""}">
        <div class="member-name">${escapeHtml(member.name || member.displayName || member.display_name || "氏名未設定")}</div>
        <div class="member-meta">${escapeHtml(member.assignment_note || member.note || member.assignment_status || "メモなし")}</div>
        <button
          type="button"
          class="secondary-button archive-assignment-btn"
          data-assignment-id="${escapeHtml(assignmentId)}"
          ${buttonDisabled ? "disabled" : ""}
        >
          ${escapeHtml(buttonLabel)}
        </button>
      </div>
    `;
  }).join("");
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
