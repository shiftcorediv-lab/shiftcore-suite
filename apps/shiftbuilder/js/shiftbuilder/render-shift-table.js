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
  if (statusLabel === "対象外") return "×";
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

function getAssignedMemberNames(cell) {
  if (!cell || !Array.isArray(cell.assigned)) {
    return [];
  }

  return cell.assigned
    .map((member) => {
      return String(
        member.display_name ||
          member.displayName ||
          member.name ||
          member.internal_user_id ||
          member.internalUserId ||
          ""
      ).trim();
    })
    .filter(Boolean);
}

function getShortAssignedMemberName(name) {
  const normalizedName = String(name || "").replace(/\s+/g, "").trim();

  if (!normalizedName) {
    return "";
  }

  return normalizedName.length > 3
    ? normalizedName.slice(0, 3)
    : normalizedName;
}

function renderAssignedMemberNames(cell) {
  const names = getAssignedMemberNames(cell);

  if (!names.length) {
    return "";
  }

  const firstName = names[0];
  const shortName = getShortAssignedMemberName(firstName);
  const hiddenCount = names.length - 1;

  return `
    <span class="shift-cell-assigned-names" title="${escapeHtml(names.join(" / "))}">
      <span class="shift-cell-assigned-name">${escapeHtml(shortName)}</span>
      ${
        hiddenCount > 0
          ? `<span class="shift-cell-assigned-more">+${hiddenCount}</span>`
          : ""
      }
    </span>
  `;
}

function normalizeWeekdayValue(dateItem) {
  return String(dateItem?.weekday || "").trim();
}

function getDateColumnClass(dateItem) {
  const weekday = normalizeWeekdayValue(dateItem);
  const classes = ["shift-date-column"];

  if (weekday === "土" || weekday.toLowerCase() === "sat") {
    classes.push("shift-date-saturday");
  }

  if (weekday === "日" || weekday.toLowerCase() === "sun") {
    classes.push("shift-date-sunday");
  }

  return classes.join(" ");
}

function getAgencyName(caseItem) {
  return String(
    caseItem?.client ||
      caseItem?.agency ||
      caseItem?.agency_name ||
      caseItem?.agencyName ||
      ""
  ).trim();
}

function shouldInsertAgencyBreak(cases, index) {
  if (index <= 0) {
    return false;
  }

  const currentAgencyName = getAgencyName(cases[index]);
  const previousAgencyName = getAgencyName(cases[index - 1]);

  if (!currentAgencyName || !previousAgencyName) {
    return false;
  }

  return currentAgencyName !== previousAgencyName;
}

function getCaseInputMode(caseItem) {
  return String(
    caseItem?.input_mode ||
      caseItem?.inputMode ||
      ""
  ).trim();
}

function getCaseRequestedDays(caseItem) {
  const value =
    caseItem?.requested_days ??
    caseItem?.requestedDays ??
    0;

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function buildLiveCaseFulfillment(caseItem) {
  const inputMode = getCaseInputMode(caseItem);
  const isDaysMode = inputMode === "days";
  const cells = caseItem?.cells || {};

  if (isDaysMode) {
    return buildLiveDaysModeFulfillment(caseItem, cells);
  }

  return buildLiveDatesModeFulfillment(cells);
}

function buildLiveDaysModeFulfillment(caseItem, cells) {
  const requiredTotal = getCaseRequestedDays(caseItem);
  let assignedDateCount = 0;
  let sameDayOverTotal = 0;

  Object.keys(cells || {}).forEach((dateKey) => {
    const cell = cells[dateKey] || {};
    const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;

    if (assignedCount > 0) {
      assignedDateCount++;
    }

    if (assignedCount > 1) {
      sameDayOverTotal += assignedCount - 1;
    }
  });

  const remainingTotal = Math.max(requiredTotal - assignedDateCount, 0);
  const overDaysTotal = Math.max(assignedDateCount - requiredTotal, 0);
  const overTotal = overDaysTotal + sameDayOverTotal;

  let status = "unfilled";
  let badgeLabel = `あと${remainingTotal}日`;

  if (requiredTotal <= 0) {
    status = "unfilled";
    badgeLabel = "日数未設定";
  } else if (sameDayOverTotal > 0) {
    status = "overfilled";
    badgeLabel = `同日超過${sameDayOverTotal}`;
  } else if (overDaysTotal > 0) {
    status = "overfilled";
    badgeLabel = `超過${overDaysTotal}日`;
  } else if (remainingTotal === 0) {
    status = "fulfilled";
    badgeLabel = "充足";
  }

  return {
    status,
    badgeLabel,
    detailLabel: `日数指定：${assignedDateCount}/${requiredTotal}日`
  };
}

function buildLiveDatesModeFulfillment(cells) {
  let requiredTotal = 0;
  let assignedTotal = 0;

  Object.keys(cells || {}).forEach((dateKey) => {
    const cell = cells[dateKey] || {};
    const requiredCount = Number(cell.required || 0);
    const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;

    requiredTotal += Number.isFinite(requiredCount) ? requiredCount : 0;
    assignedTotal += assignedCount;
  });

  const remainingTotal = Math.max(requiredTotal - assignedTotal, 0);
  const overTotal = Math.max(assignedTotal - requiredTotal, 0);

  let status = "unfilled";
  let badgeLabel = `あと${remainingTotal}枠`;

  if (requiredTotal <= 0) {
    status = "unfilled";
    badgeLabel = "必要数未設定";
  } else if (overTotal > 0) {
    status = "overfilled";
    badgeLabel = `超過${overTotal}枠`;
  } else if (remainingTotal === 0) {
    status = "fulfilled";
    badgeLabel = "充足";
  }

  return {
    status,
    badgeLabel,
    detailLabel: `日付指定：${assignedTotal}/${requiredTotal}枠`
  };
}

function getFulfillmentClass(caseItem) {
  const fulfillment = buildLiveCaseFulfillment(caseItem);

  if (fulfillment.status === "fulfilled") {
    return "case-fulfillment-fulfilled";
  }

  if (fulfillment.status === "overfilled") {
    return "case-fulfillment-overfilled";
  }

  return "case-fulfillment-unfilled";
}

function renderFulfillmentBadge(caseItem) {
  const fulfillment = buildLiveCaseFulfillment(caseItem);

  const title = fulfillment.detailLabel
    ? `${fulfillment.badgeLabel} / ${fulfillment.detailLabel}`
    : fulfillment.badgeLabel;

  return `
    <span
      class="case-fulfillment-badge case-fulfillment-badge-${escapeHtml(fulfillment.status)}"
      title="${escapeHtml(title)}"
    >
      ${escapeHtml(fulfillment.badgeLabel)}
    </span>
  `;
}

export function renderShiftTable(data, elements, handlers = {}) {
  const { shiftTableHead, shiftTableBody } = elements;
  const {
    onSelectCell,
    onPreviewCell,
    onLeaveCell,
    onCloseCell
  } = handlers;

  const dates = Array.isArray(data?.dates) ? data.dates : [];
  const cases = Array.isArray(data?.cases) ? data.cases : [];

  shiftTableHead.innerHTML = `
    <tr>
      <th class="case-header-cell">案件</th>
      ${dates
        .map((dateItem) => {
          const dateColumnClass = getDateColumnClass(dateItem);

          return `
            <th class="${escapeHtml(dateColumnClass)}">
              <div class="table-date-label">${escapeHtml(dateItem.label)}</div>
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
    .map((caseItem, index) => {
      const rowClasses = [
        shouldInsertAgencyBreak(cases, index) ? "case-agency-break" : "",
        getFulfillmentClass(caseItem)
      ]
        .filter(Boolean)
        .join(" ");

      const fulfillmentBadge = renderFulfillmentBadge(caseItem);

      const caseFulfillment = buildLiveCaseFulfillment(caseItem);
      const isDaysModeCase = getCaseInputMode(caseItem) === "days";
      
      const dateCells = dates
        .map((dateItem) => {
          const cell = caseItem.cells?.[dateItem.date] || EMPTY_CELL;

          const status = getCellStatus(cell);
          const compactStatusLabel = getCompactStatusLabel(status.label);
          const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;
          const required = Number(cell.required || 0);
          const isSaving = hasSavingAssignment(cell);
          const dateColumnClass = getDateColumnClass(dateItem);

          const isFulfilledDaysModeUnassigned =
            isDaysModeCase &&
            caseFulfillment.status === "fulfilled" &&
            status.key === SHIFT_CELL_STATUS.UNASSIGNED;

          const shiftCellClass = [
            "shift-cell",
            `shift-cell-${status.key}`,
            isFulfilledDaysModeUnassigned ? "shift-cell-unassigned-fulfilled-days" : "",
            isSaving ? "shift-cell-saving" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return `

            <td class="${escapeHtml(dateColumnClass)}">

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

                ${

                  status.key === SHIFT_CELL_STATUS.COMPLETED && assignedCount > 0

                    ? renderAssignedMemberNames(cell)

                    : `<span class="shift-cell-count">${assignedCount}/${required}</span>`

                }

                <span class="shift-cell-note">${escapeHtml(status.note)}</span>

              </button>

            </td>

          `;
        })
        .join("");

      return `
        <tr class="${escapeHtml(rowClasses)}">
          <td class="case-cell">
            <div class="case-title">${escapeHtml(caseItem.title)}</div>
            <div class="case-meta">${escapeHtml(caseItem.client)} / ${escapeHtml(caseItem.area)}</div>
            <div class="case-fulfillment-row">
              ${fulfillmentBadge}
            </div>
            <div class="case-id">${escapeHtml(caseItem.caseId)}</div>
          </td>
          ${dateCells}
        </tr>
      `;
    })
    .join("");

  bindShiftCellEvents(shiftTableBody, {
    onSelectCell,
    onPreviewCell,
    onLeaveCell,
    onCloseCell
  });
}

function getShiftCellMatrix(rootElement) {
  return Array.from(rootElement.querySelectorAll("tr")).map((row) => {
    return Array.from(row.querySelectorAll(".shift-cell"));
  }).filter((rowCells) => rowCells.length > 0);
}

function findCellPosition(matrix, targetButton) {
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
    const colIndex = matrix[rowIndex].indexOf(targetButton);

    if (colIndex >= 0) {
      return {
        rowIndex,
        colIndex
      };
    }
  }

  return null;
}

function focusShiftCellByPosition(rootElement, currentButton, rowOffset, colOffset) {
  const matrix = getShiftCellMatrix(rootElement);
  const currentPosition = findCellPosition(matrix, currentButton);

  if (!currentPosition) {
    return;
  }

  const nextRowIndex = Math.min(
    Math.max(currentPosition.rowIndex + rowOffset, 0),
    matrix.length - 1
  );

  const nextRow = matrix[nextRowIndex] || [];
  const nextColIndex = Math.min(
    Math.max(currentPosition.colIndex + colOffset, 0),
    nextRow.length - 1
  );

  const nextButton = nextRow[nextColIndex];

  if (!nextButton) {
    return;
  }

  nextButton.focus();
  nextButton.scrollIntoView({
    block: "nearest",
    inline: "nearest"
  });
}

function focusRowEdgeCell(rootElement, currentButton, direction) {
  const matrix = getShiftCellMatrix(rootElement);
  const currentPosition = findCellPosition(matrix, currentButton);

  if (!currentPosition) {
    return;
  }

  const row = matrix[currentPosition.rowIndex] || [];
  const nextButton = direction === "start" ? row[0] : row[row.length - 1];

  if (!nextButton) {
    return;
  }

  nextButton.focus();
  nextButton.scrollIntoView({
    block: "nearest",
    inline: "nearest"
  });
}

function bindShiftCellEvents(rootElement, handlers = {}) {
  const {
    onSelectCell,
    onPreviewCell,
    onLeaveCell,
    onCloseCell
  } = handlers;

  const cells = rootElement.querySelectorAll(".shift-cell");

  cells.forEach((cellButton) => {
    cellButton.addEventListener("mouseenter", () => {
      const caseId = cellButton.dataset.caseId;
      const date = cellButton.dataset.date;

      if (typeof onPreviewCell === "function") {
        onPreviewCell(caseId, date, cellButton);
      }
    });

    cellButton.addEventListener("mouseleave", () => {
      const caseId = cellButton.dataset.caseId;
      const date = cellButton.dataset.date;

      if (typeof onLeaveCell === "function") {
        onLeaveCell(caseId, date, cellButton);
      }
    });

    cellButton.addEventListener("focus", () => {
      const caseId = cellButton.dataset.caseId;
      const date = cellButton.dataset.date;

      if (typeof onPreviewCell === "function") {
        onPreviewCell(caseId, date, cellButton);
      }
    });

    cellButton.addEventListener("blur", () => {
      const caseId = cellButton.dataset.caseId;
      const date = cellButton.dataset.date;

      if (typeof onLeaveCell === "function") {
        onLeaveCell(caseId, date, cellButton);
      }
    });

    cellButton.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusShiftCellByPosition(rootElement, cellButton, -1, 0);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusShiftCellByPosition(rootElement, cellButton, 1, 0);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusShiftCellByPosition(rootElement, cellButton, 0, -1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusShiftCellByPosition(rootElement, cellButton, 0, 1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusRowEdgeCell(rootElement, cellButton, "start");
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusRowEdgeCell(rootElement, cellButton, "end");
        return;
      }

      if (event.key === "Escape") {
        if (typeof onCloseCell === "function") {
          event.preventDefault();
          onCloseCell();
        }
      }
    });

    cellButton.addEventListener("click", () => {
      const caseId = cellButton.dataset.caseId;
      const date = cellButton.dataset.date;

      if (typeof onSelectCell === "function") {
        onSelectCell(caseId, date, cellButton);
      }
    });
  });
}

// ===== ShiftBuilder render-shift-table.js ここまで =====
