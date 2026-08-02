function createCaseDates_(caseId, targetMonth, caseDates, options) {
  const safeOptions = options || {};
  const createdRows = [];

  caseDates.forEach(function(dateItem) {
    const workDate = dateItem.work_date;

    if (!workDate) {
      return;
    }

    const forceSinglePerson = safeOptions.force_single_person === true;

    const requiredLines = forceSinglePerson
      ? 1
      : toNumber_(dateItem.required_lines, safeOptions.default_required_lines);

    const peoplePerLine = forceSinglePerson
      ? 1
      : toNumber_(dateItem.people_per_line, safeOptions.default_people_per_line);

    const requiredPeople = requiredLines * peoplePerLine;

    const caseDateId = generateCaseDateId_(targetMonth);

    const record = {
      case_date_id: caseDateId,
      case_id: caseId,
      work_date: workDate,

      required_lines: requiredLines,
      people_per_line: peoplePerLine,
      required_people: requiredPeople,

      memo: dateItem.memo || '',

      created_at: safeOptions.now,
      updated_at: safeOptions.now
    };

    appendObjectRow_(SHEET_CASE_DATES, record);
    createdRows.push(record);
  });

  return createdRows;
}

function generateCaseDateId_(targetMonth) {
  const ym = String(targetMonth).replace('-', '');
  const prefix = 'CD-' + ym + '-';

  const rows = getSheetObjects_(SHEET_CASE_DATES);

  const count = rows.filter(function(row) {
    return String(row.case_date_id || '').indexOf(prefix) === 0;
  }).length;

  return prefix + String(count + 1).padStart(6, '0');
}