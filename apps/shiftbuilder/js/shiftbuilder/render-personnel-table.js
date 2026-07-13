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
    <div class="personnel-meta">${escapeHtml(accountCode)} / ${escapeHtml(person.id)}</div>
    <div class="personnel-meta">${escapeHtml(attributes.join(" / "))}</div>
  `;
}

function renderPersonnelGauge(person) {
  return `
    <div class="row-fulfillment" aria-label="${escapeHtml(`配置 ${person.assignedDaysCount}日、目標未設定`)}">
      <div class="row-fulfillment-labels">
        <span>配置 ${person.assignedDaysCount}日</span>
        <span>目標未設定</span>
      </div>
      <div class="row-fulfillment-track is-unknown" aria-hidden="true"></div>
    </div>
  `;
}

function renderPersonnelDateCell(assignments) {
  if (!assignments.length) {
    return `
      <div
        class="personnel-shift-cell personnel-shift-cell-empty"
        title="未配置（勤務可否は未確認）"
        aria-label="未配置。勤務可否は未確認"
      >
        —
      </div>
    `;
  }

  const isConflict = assignments.length > 1;
  const caseNames = assignments.map((assignment) => assignment.caseTitle);
  const title = isConflict
    ? `同日重複：${caseNames.join(" / ")}`
    : caseNames[0];

  return `
    <div
      class="personnel-shift-cell ${isConflict ? "is-conflict" : "is-assigned"}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
    >
      ${isConflict ? '<span class="personnel-shift-status">重複</span>' : ""}
      <span class="personnel-shift-case">${escapeHtml(caseNames[0])}</span>
      ${assignments.length > 1 ? `<span class="personnel-shift-more">+${assignments.length - 1}</span>` : ""}
    </div>
  `;
}

export function renderPersonnelTable(viewModel, elements) {
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

          return `
            <td class="${escapeHtml(getDateColumnClass(dateItem))}">
              ${renderPersonnelDateCell(assignments)}
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          <td class="personnel-cell">
            <div class="personnel-name">${escapeHtml(person.displayName)}</div>
            ${renderPersonMeta(person)}
            ${renderPersonnelGauge(person)}
          </td>
          ${dateCells}
        </tr>
      `;
    })
    .join("");
}

// ===== ShiftBuilder render-personnel-table.js ここまで =====
