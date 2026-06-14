// ===== ShiftBuilder render-shift-table.js ここから =====

import { escapeHtml } from "./utils.js";

export function getCellStatus(cell) {
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

export function renderShiftTable(data, elements, handlers = {}) {
  const { shiftTableHead, shiftTableBody } = elements;
  const { onSelectCell } = handlers;

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
