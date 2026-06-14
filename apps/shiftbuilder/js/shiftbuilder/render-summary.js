// ===== ShiftBuilder render-summary.js ここから =====

export function calculateSummary(data) {
  let requiredTotal = 0;
  let assignedTotal = 0;
  let shortageTotal = 0;
  let unassignedCellCount = 0;
  let overCellCount = 0;

  data.cases.forEach((caseItem) => {
    data.dates.forEach((dateItem) => {
      const cell = caseItem.cells[dateItem.date] || {
        required: 0,
        assigned: [],
        candidates: []
      };

      const required = Number(cell.required || 0);
      const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;

      requiredTotal += required;
      assignedTotal += assignedCount;

      if (assignedCount < required) {
        shortageTotal += required - assignedCount;
      }

      if (required > 0 && assignedCount === 0) {
        unassignedCellCount += 1;
      }

      if (assignedCount > required) {
        overCellCount += 1;
      }
    });
  });

  const completionRate =
    requiredTotal > 0
      ? Math.round((assignedTotal / requiredTotal) * 100)
      : 100;

  return {
    requiredTotal,
    assignedTotal,
    shortageTotal,
    completionRate,
    unassignedCellCount,
    overCellCount
  };
}

export function renderSummary(data, elements) {
  const summary = calculateSummary(data);

  elements.requiredTotalText.textContent = `${summary.requiredTotal}`;
  elements.assignedTotalText.textContent = `${summary.assignedTotal}`;
  elements.shortageTotalText.textContent = `${summary.shortageTotal}`;
  elements.completionRateText.textContent = `${summary.completionRate}%`;
  elements.unassignedCellText.textContent = `${summary.unassignedCellCount}`;
  elements.overCellText.textContent = `${summary.overCellCount}`;
}

// ===== ShiftBuilder render-summary.js ここまで =====
