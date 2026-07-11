// ===== ShiftBuilder render-summary.js ここから =====

function getCaseInputMode(caseItem) {
  return String(
    caseItem?.input_mode ||
      caseItem?.inputMode ||
      ""
  ).trim();
}

function getRequestedDays(caseItem) {
  const requestedDays = Number(
    caseItem?.requested_days ??
      caseItem?.requestedDays ??
      0
  );

  return Number.isFinite(requestedDays)
    ? Math.max(requestedDays, 0)
    : 0;
}

function getAssignedCount(cell) {
  return Array.isArray(cell?.assigned) ? cell.assigned.length : 0;
}

function calculateDaysModeCaseSummary(caseItem) {
  const required = getRequestedDays(caseItem);
  const cells = caseItem?.cells || {};

  const assigned = Object.values(cells).reduce((count, cell) => {
    return getAssignedCount(cell) > 0 ? count + 1 : count;
  }, 0);

  return {
    required,
    assigned,
    shortage: Math.max(required - assigned, 0)
  };
}

function calculateDatesModeCaseSummary(caseItem, dates) {
  return dates.reduce((summary, dateItem) => {
    const cell = caseItem?.cells?.[dateItem.date] || {};
    const requiredValue = Number(cell.required || 0);
    const required = Number.isFinite(requiredValue)
      ? Math.max(requiredValue, 0)
      : 0;
    const assigned = getAssignedCount(cell);

    summary.required += required;
    summary.assigned += assigned;
    summary.shortage += Math.max(required - assigned, 0);

    return summary;
  }, {
    required: 0,
    assigned: 0,
    shortage: 0
  });
}

export function calculateSummary(data) {
  const cases = Array.isArray(data?.cases) ? data.cases : [];
  const dates = Array.isArray(data?.dates) ? data.dates : [];

  const totals = cases.reduce((summary, caseItem) => {
    const caseSummary = getCaseInputMode(caseItem) === "days"
      ? calculateDaysModeCaseSummary(caseItem)
      : calculateDatesModeCaseSummary(caseItem, dates);

    summary.requiredTotal += caseSummary.required;
    summary.assignedTotal += caseSummary.assigned;
    summary.shortageTotal += caseSummary.shortage;

    return summary;
  }, {
    requiredTotal: 0,
    assignedTotal: 0,
    shortageTotal: 0
  });

  const completionRate = totals.requiredTotal > 0
    ? Math.min(
        Math.round((totals.assignedTotal / totals.requiredTotal) * 100),
        100
      )
    : 100;

  return {
    ...totals,
    completionRate
  };
}

export function renderSummary(data, elements) {
  const summary = calculateSummary(data);

  elements.requiredTotalText.textContent = `${summary.requiredTotal}`;
  elements.assignedTotalText.textContent = `${summary.assignedTotal}`;
  elements.shortageTotalText.textContent = `${summary.shortageTotal}`;
  elements.completionRateText.textContent = `${summary.completionRate}%`;
}

// ===== ShiftBuilder render-summary.js ここまで =====
