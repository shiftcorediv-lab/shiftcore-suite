// ===== ShiftBuilder render-shift-table.js ここから =====

import { escapeHtml } from "./utils.js";
import {
  SHIFT_CELL_STATUS,
  SHIFT_CELL_STATUS_LABELS,
  EMPTY_CELL
} from "./constants.js";

export function getCellStatus(cell) {
  const required = Number(cell?.required || 0);
  const assignedCount = Array.isArray(cell?.assigned) ? cell.assigned.length : 0;

  if (required === 0 && assignedCount === 0) {
    return {
      key: SHIFT_CELL_STATUS.COMPLETED,
      label: "対象外",
      note: "必要枠なし"
    };
  }

  if (assignedCount === 0) {
    return {
      key: SHIFT_CELL_STATUS.UNASSIGNED,
      label: SHIFT_CELL_STATUS_LABELS[SHIFT_CELL_STATUS.UNASSIGNED],
      note: `${assignedCount}/${required}`
    };
  }

  if (assignedCount < required) {
    return {
      key: SHIFT_CELL_STATUS.SHORTAGE,
      label: SHIFT_CELL_STATUS_LABELS[SHIFT_CELL_STATUS.SHORTAGE],
      note: `${assignedCount}/${required}`
    };
  }

  if (assignedCount === required) {
    return {
      key: SHIFT_CELL_STATUS.COMPLETED,
      label: SHIFT_CELL_STATUS_LABELS[SHIFT_CELL_STATUS.COMPLETED],
      note: `${assignedCount}/${required}`
    };
  }

  return {
    key: SHIFT_CELL_STATUS.OVER,
    label: SHIFT_CELL_STATUS_LABELS[SHIFT_CELL_STATUS.OVER],
    note: `${assignedCount}/${required}`
  };
}

function getCompactStatusLabel(statusLabel) {
  if (statusLabel === "対象外") return "外";
  if (statusLabel === "アサイン完了") return "完";
  if (statusLabel === "未アサイン") return "未";
  if (statusLabel === "不足") return "不足";
  if (statusLabel === "超過") return "超過";

  return statusLabel || "";
}

function hasSavingAssignment(cell) {
  if (!cell || !Array.isArray(cell.assigned)) {
    return false;
  }

  return cell.assigned.some((member) => {
    const assignmentId = member.assignment_id || member.assignmentId || "";

    return (
      member.is_pending === true ||
      member.isPending === true ||
      member.assignment_status === "saving" ||
      String(assignmentId).startsWith("PENDING-")
    );
  });
}

export function renderShiftTable(data, elements, handlers = {}) {
  const { shiftTableHead, shiftTableBody } = elements;
  const { onSelectCell } = handlers;

  const dates = Array.isArray(data?.dates) ? data.dates : [];
  const cases = Array.isArray(data?.cases) ? data.cases : [];

  shiftTableHead.innerHTML = `
    <tr>
      <th>案件</th>
      ${dates
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

  if (cases.length === 0) {
    const colspan = dates.length + 1;

    shiftTableBody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="empty-cell">
          対象月の案件データはありません。対象月・エリアを確認してください。
        </td>
      </tr>
    `;

    return;
  }

  shiftTableBody.innerHTML = cases
    .map((caseItem) => {
      const dateCells = dates
        .map((dateItem) => {
          const cell = caseItem.cells?.[dateItem.date] || EMPTY_CELL;

          const status = getCellStatus(cell);
          const compactStatusLabel = getCompactStatusLabel(status.label);
          const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;
          const required = Number(cell.required || 0);
          const isSaving = hasSavingAssignment(cell);

          const shiftCellClass = [
            "shift-cell",
            `shift-cell-${status.key}`,
            isSaving ? "shift-cell-saving" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return `
            <td>
              <button
                type="button"
                class="${escapeHtml(shiftCellClass)}"
                data-case-id="${escapeHtml(caseItem.caseId)}"
                data-date="${escapeHtml(dateItem.date)}"
                title="${escapeHtml(status.label)} ${assignedCount}/${required}"
              >
                <span class="shift-cell-status" title="${escapeHtml(status.label)}">
                  ${escapeHtml(compactStatusLabel)}
                </span>
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

  bindShiftCellEvents(shiftTableBody, onSelectCell);
}

function bindShiftCellEvents(rootElement, onSelectCell) {
  const cells = rootElement.querySelectorAll(".shift-cell");

  cells.forEach((cellButton) => {
    cellButton.addEventListener("click", () => {
      const caseId = cellButton.dataset.caseId;
      const date = cellButton.dataset.date;

      if (typeof onSelectCell === "function") {
        onSelectCell(caseId, date);
      }
    });
  });
}

// ===== ShiftBuilder render-shift-table.js ここまで =====
