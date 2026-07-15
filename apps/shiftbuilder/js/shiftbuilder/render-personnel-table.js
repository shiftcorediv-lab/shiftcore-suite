// ===== ShiftBuilder render-personnel-table.js ここから =====

import { escapeHtml } from "./utils.js";

function getDateColumnClass(dateItem) {
  const weekday = String(dateItem?.weekday || "").trim().toLowerCase();
  const classes = ["shift-date-column"];

  if (weekday === "土" || weekday === "sat") {
    classes.push("shift-date-saturday");
  }

  if (weekday === "日" || weekday === "sun") {
    classes.push("shift-date-sunday");
  }

  return classes.join(" ");
}

function renderPersonMeta(person) {
  const accountCode = person.accountCode || "コード未設定";
  const attributes = [
    person.personType || "区分未設定",
    person.contractType || "契約未設定",
    person.baseArea || "拠点未設定"
  ];

  return `
    <div class="personnel-identity">
      <div class="personnel-name" title="${escapeHtml(person.displayName)}">${escapeHtml(person.displayName)}</div>
      <div class="personnel-account">${escapeHtml(accountCode)} / ${escapeHtml(person.id)}</div>
    </div>
    <div class="personnel-meta">${escapeHtml(attributes.join(" / "))}</div>
  `;
}

function renderPersonnelGauge(person) {
  return `
    <div class="row-fulfillment" aria-label="${escapeHtml(`配置 ${person.assignedDaysCount}日、目標未設定`)}">
      <div class="row-fulfillment-labels">
        <span>配置 ${person.assignedDaysCount}日 / ${person.assignmentCount}件${person.conflictDaysCount ? ` / 重複${person.conflictDaysCount}日` : ""}</span>
        <span>目標未設定</span>
      </div>
      <div class="row-fulfillment-track is-unknown" aria-hidden="true"></div>
    </div>
  `;
}

function renderPersonnelDateCell(person, dateItem, assignments, consecutiveWorkAlert = null) {
  if (!assignments.length) {
    return `
      <button
        type="button"
        class="personnel-shift-cell personnel-shift-cell-empty"
        data-person-id="${escapeHtml(person.id)}"
        data-date="${escapeHtml(dateItem.date)}"
        title="未配置（勤務可否は未確認）"
        aria-label="未配置。勤務可否は未確認"
      >
        —
      </button>
    `;
  }

  const isConflict = assignments.length > 1;
  const caseNames = assignments.map((assignment) => assignment.caseTitle);
  const caseDisplayNames = assignments.map(
    (assignment) => assignment.caseDisplayTitle || assignment.caseTitle
  );
  const title = [
    isConflict ? `同日重複：${caseNames.join(" / ")}` : caseNames[0],
    consecutiveWorkAlert?.message || ""
  ].filter(Boolean).join(" / ");
  const alertClass = consecutiveWorkAlert
    ? `is-consecutive-${consecutiveWorkAlert.level}`
    : "";
  const statusBadges = [
    isConflict ? '<span class="personnel-shift-status" title="同日重複">重</span>' : "",
    consecutiveWorkAlert
      ? `<span class="personnel-shift-status" title="連勤${consecutiveWorkAlert.consecutiveDays}日">${consecutiveWorkAlert.consecutiveDays}連</span>`
      : ""
  ].filter(Boolean).join("");

  return `
    <button
      type="button"
      class="personnel-shift-cell ${isConflict ? "is-conflict" : "is-assigned"} ${alertClass} ${statusBadges ? "has-status" : ""}"
      data-person-id="${escapeHtml(person.id)}"
      data-date="${escapeHtml(dateItem.date)}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
    >
      <span class="personnel-shift-statuses" aria-hidden="true">${statusBadges}</span>
      <span class="personnel-shift-label-row">
        <span class="personnel-shift-case">${escapeHtml(caseDisplayNames[0])}</span>
        ${assignments.length > 1 ? `<span class="personnel-shift-more">+${assignments.length - 1}</span>` : ""}
      </span>
    </button>
  `;
}

function bindPersonnelCellEvents(rootElement, onSelectCell) {
  const cells = rootElement.querySelectorAll(".personnel-shift-cell");

  function moveFocus(currentButton, rowOffset, columnOffset) {
    const matrix = Array.from(rootElement.querySelectorAll("tr"))
      .map((row) => Array.from(row.querySelectorAll(".personnel-shift-cell")))
      .filter((rowCells) => rowCells.length > 0);
    const rowIndex = matrix.findIndex((row) => row.includes(currentButton));
    const columnIndex = rowIndex >= 0 ? matrix[rowIndex].indexOf(currentButton) : -1;

    if (rowIndex < 0 || columnIndex < 0) {
      return;
    }

    const nextRow = matrix[Math.min(Math.max(rowIndex + rowOffset, 0), matrix.length - 1)];
    const nextButton = nextRow?.[Math.min(Math.max(columnIndex + columnOffset, 0), nextRow.length - 1)];

    nextButton?.focus();
    nextButton?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  cells.forEach((cellButton) => {
    cellButton.addEventListener("click", () => {
      onSelectCell?.(cellButton.dataset.personId || "", cellButton.dataset.date || "", cellButton);
    });

    cellButton.addEventListener("keydown", (event) => {
      const offsets = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1]
      };
      const offset = offsets[event.key];

      if (!offset) {
        return;
      }

      event.preventDefault();
      moveFocus(cellButton, offset[0], offset[1]);
    });
  });
}

export function renderPersonnelTable(viewModel, elements, handlers = {}) {
  const dates = Array.isArray(viewModel?.dates) ? viewModel.dates : [];
  const people = Array.isArray(viewModel?.people) ? viewModel.people : [];

  elements.shiftTableHead.innerHTML = `
    <tr>
      <th class="personnel-header-cell">人員</th>
      ${dates
        .map(
          (dateItem) => `
            <th class="${escapeHtml(getDateColumnClass(dateItem))}">
              <div class="table-date-label">${escapeHtml(dateItem.label)}</div>
              <div class="table-weekday">${escapeHtml(dateItem.weekday)}</div>
            </th>
          `
        )
        .join("")}
    </tr>
  `;

  if (!people.length) {
    elements.shiftTableBody.innerHTML = `
      <tr>
        <td colspan="${dates.length + 1}" class="empty-cell">
          表示できる人員がいません。候補者データの取得状況を確認してください。
        </td>
      </tr>
    `;
    return;
  }

  elements.shiftTableBody.innerHTML = people
    .map((person) => {
      const dateCells = dates
        .map((dateItem) => {
          const assignments = person.assignmentsByDate[dateItem.date] || [];
          const consecutiveWorkAlert = person.consecutiveAlertsByDate?.[dateItem.date] || null;

          return `
            <td class="${escapeHtml(getDateColumnClass(dateItem))}">
              ${renderPersonnelDateCell(person, dateItem, assignments, consecutiveWorkAlert)}
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          <td class="personnel-cell">
            ${renderPersonMeta(person)}
            ${renderPersonnelGauge(person)}
          </td>
          ${dateCells}
        </tr>
      `;
    })
    .join("");

  bindPersonnelCellEvents(elements.shiftTableBody, handlers.onSelectCell);
}

// ===== ShiftBuilder render-personnel-table.js ここまで =====
