// ===== ShiftBuilder consecutive-work-alert.js ここから =====

const ALERT_LEVELS = [
  { minimumDays: 6, level: "critical", label: "強い警告" },
  { minimumDays: 5, level: "warning", label: "警告" },
  { minimumDays: 4, level: "notice", label: "注意" }
];

function getUserId(member) {
  return String(member?.internal_user_id || member?.internalUserId || "");
}

function addAssignedDates(data, userId, dates) {
  const cases = Array.isArray(data?.cases) ? data.cases : [];
  const dateItems = Array.isArray(data?.dates) ? data.dates : [];

  cases.forEach((caseItem) => {
    dateItems.forEach((dateItem) => {
      const assigned = caseItem?.cells?.[dateItem.date]?.assigned;

      if (Array.isArray(assigned) && assigned.some((member) => getUserId(member) === userId)) {
        dates.add(dateItem.date);
      }
    });
  });
}

function isNextDay(previousDate, nextDate) {
  const previous = new Date(`${previousDate}T00:00:00Z`);
  const next = new Date(`${nextDate}T00:00:00Z`);

  return (next.getTime() - previous.getTime()) === 24 * 60 * 60 * 1000;
}

function getAlertLevel(consecutiveDays) {
  return ALERT_LEVELS.find((item) => consecutiveDays >= item.minimumDays) || null;
}

export function getConsecutiveWorkAlert({
  previousMonthData,
  currentMonthData,
  internalUserId,
  workDate
} = {}) {
  const userId = String(internalUserId || "");
  const targetDate = String(workDate || "");

  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return null;
  }

  const assignedDates = new Set();
  addAssignedDates(previousMonthData, userId, assignedDates);
  addAssignedDates(currentMonthData, userId, assignedDates);
  assignedDates.add(targetDate);

  const sortedDates = Array.from(assignedDates).sort();
  const targetIndex = sortedDates.indexOf(targetDate);

  if (targetIndex < 0) {
    return null;
  }

  let startIndex = targetIndex;
  let endIndex = targetIndex;

  while (
    startIndex > 0 &&
    isNextDay(sortedDates[startIndex - 1], sortedDates[startIndex])
  ) {
    startIndex--;
  }

  while (
    endIndex < sortedDates.length - 1 &&
    isNextDay(sortedDates[endIndex], sortedDates[endIndex + 1])
  ) {
    endIndex++;
  }

  const consecutiveDays = endIndex - startIndex + 1;
  const alert = getAlertLevel(consecutiveDays);

  if (!alert) {
    return null;
  }

  return {
    ...alert,
    consecutiveDays,
    startsOn: sortedDates[startIndex],
    endsOn: sortedDates[endIndex],
    message: `連勤${consecutiveDays}日（${alert.label}）`
  };
}

// ===== ShiftBuilder consecutive-work-alert.js ここまで =====
