// 日数指定の未配置分には日付がないため、全日への需要として水増ししない。
export function buildPersonnelDailySummary(dates, cases, people) {
  const undated = cases.some(item => {
    if ((item.input_mode || item.inputMode) !== 'days') return false;
    const assignedDays = Object.values(item.cells || {}).filter(cell => cell.assigned?.length).length;
    return Number(item.requested_days ?? item.requestedDays ?? 0) > assignedDays;
  });
  const submissionKnown = people.every(person => typeof person.pmoSubmitted === 'boolean');
  return dates.map(({date}) => {
    const submitted = submissionKnown ? people.filter(person => person.pmoSubmitted && !person.requestedOffDates.includes(date)).length : null;
    const required = cases.reduce((count, item) => {
      const cell = item.cells?.[date];
      if ((item.input_mode || item.inputMode) === 'days') return count + (cell?.assigned?.length ? 1 : 0);
      return count + Math.max(0, Number(cell?.required) || 0);
    }, 0);
    return {date, submitted, required, undated, balance: undated || submitted === null ? null : submitted - required};
  });
}
