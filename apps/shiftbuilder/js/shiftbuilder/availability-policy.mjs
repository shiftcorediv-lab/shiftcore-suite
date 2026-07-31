function normalizeDate(value) {
  return String(value || "").trim();
}

export function getRequestedOffState(candidate, workDate) {
  const targetDate = normalizeDate(workDate);
  const dates = Array.isArray(candidate?.requested_off_dates)
    ? candidate.requested_off_dates
    : Array.isArray(candidate?.requestedOffDates)
      ? candidate.requestedOffDates
      : [];
  const requestedOff = dates.some((date) => normalizeDate(date) === targetDate);

  return {
    requestedOff,
    memo: String(
      candidate?.requested_off_memo ||
      candidate?.requestedOffMemo ||
      ""
    ).trim()
  };
}
