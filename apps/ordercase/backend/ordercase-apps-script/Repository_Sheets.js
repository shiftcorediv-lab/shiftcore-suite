/****************************************************
 * Repository_Sheets.gs
 * シート読み書き共通処理
 ****************************************************/


/****************************************************
 * getSheetObjects_ ここから
 * シートをオブジェクト配列として取得
 * 日付・時刻・TRUE/FALSEをAPI向けに整形する
 ****************************************************/
function getSheetObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values[0];

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== '' && cell !== null;
      });
    })
    .map(function(row) {
      const obj = {};

      headers.forEach(function(header, index) {
        obj[header] = normalizeSheetValue_(header, row[index]);
      });

      return obj;
    });
}
/****************************************************
 * getSheetObjects_ ここまで
 ****************************************************/


/****************************************************
 * appendObjectRow_ ここから
 * オブジェクトをヘッダー順に並べて1行追加
 ****************************************************/
function appendObjectRow_(sheetName, record) {
  const sheet = getSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const row = headers.map(function(header) {
    return record[header] !== undefined ? record[header] : '';
  });

  sheet.appendRow(row);
}
/****************************************************
 * appendObjectRow_ ここまで
 ****************************************************/


/****************************************************
 * getSpreadsheet_ ここから
 * OrderCase Master Sheet を取得
 ****************************************************/
function getSpreadsheet_() {
  return SpreadsheetApp.openById(ORDERCASE_SPREADSHEET_ID);
}

function getShiftBuilderSpreadsheetForOrderCase_() {
  if (!SHIFTBUILDER_SPREADSHEET_ID) {
    throw new Error('SHIFTBUILDER_SPREADSHEET_ID が未設定です。');
  }

  return SpreadsheetApp.openById(SHIFTBUILDER_SPREADSHEET_ID);
}

function getShiftAssignmentsSheetForOrderCase_() {
  const sheet = getShiftBuilderSpreadsheetForOrderCase_()
    .getSheetByName(SHEET_SHIFT_ASSIGNMENTS);

  if (!sheet) {
    throw new Error('シートが見つかりません: ' + SHEET_SHIFT_ASSIGNMENTS);
  }

  return sheet;
}
/****************************************************
 * getSpreadsheet_ ここまで
 ****************************************************/


/****************************************************
 * getSheet_ ここから
 * 指定シートを取得
 ****************************************************/
function getSheet_(sheetName) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('シートが見つかりません: ' + sheetName);
  }

  return sheet;
}
/****************************************************
 * getSheet_ ここまで
 ****************************************************/


/****************************************************
 * 案件無効化連動アサイン解除 ここから
 ****************************************************/
function buildShiftAssignmentArchivePlan_(values, caseId) {
  const normalizedCaseId = String(caseId || '').trim();

  if (!normalizedCaseId) {
    throw new Error('case_id が必要です。');
  }

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('shift_assignments のヘッダーを取得できません。');
  }

  const headers = values[0].map(function(header) {
    return String(header || '').trim();
  });
  const requiredHeaders = [
    'assignment_id',
    'case_id',
    'assignment_status',
    'change_reason_type',
    'change_memo',
    'updated_at',
    'updated_by',
    'archived'
  ];
  const headerIndexes = {};

  requiredHeaders.forEach(function(header) {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error('shift_assignments に必須列がありません: ' + header);
    }

    headerIndexes[header] = index;
  });

  const activeRowNumbers = [];
  const repairRowNumbers = [];
  const targetRowNumbers = [];
  const assignmentIds = [];

  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    const rowCaseId = String(row[headerIndexes.case_id] || '').trim();

    if (rowCaseId !== normalizedCaseId) {
      continue;
    }

    const archived =
      row[headerIndexes.archived] === true ||
      String(row[headerIndexes.archived] || '').trim().toLowerCase() === 'true';
    const status = String(
      row[headerIndexes.assignment_status] || ''
    ).trim().toLowerCase();
    const reasonType = String(
      row[headerIndexes.change_reason_type] || ''
    ).trim().toLowerCase();
    const isActive =
      !archived &&
      status !== 'archived' &&
      status !== 'cancelled';
    const isCaseDeactivationReason =
      reasonType === 'case_cancelled' ||
      reasonType === 'case_archived';
    const needsPartialRepair =
      isCaseDeactivationReason &&
      (!archived || status !== 'archived');

    if (!isActive && !needsPartialRepair) {
      continue;
    }

    const rowNumber = index + 1;
    targetRowNumbers.push(rowNumber);
    assignmentIds.push(String(row[headerIndexes.assignment_id] || '').trim());

    if (isActive) {
      activeRowNumbers.push(rowNumber);
    } else {
      repairRowNumbers.push(rowNumber);
    }
  }

  return {
    active_row_numbers: activeRowNumbers,
    repair_row_numbers: repairRowNumbers,
    target_row_numbers: targetRowNumbers,
    assignment_ids: assignmentIds,
    header_indexes: headerIndexes
  };
}

function columnNumberToA1_(columnNumber) {
  let value = Number(columnNumber);
  let result = '';

  if (!Number.isFinite(value) || value < 1) {
    throw new Error('列番号が不正です: ' + columnNumber);
  }

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function setShiftAssignmentColumnValueForRows_(
  sheet,
  rowNumbers,
  zeroBasedColumnIndex,
  value
) {
  if (!rowNumbers.length) {
    return;
  }

  const columnA1 = columnNumberToA1_(zeroBasedColumnIndex + 1);
  const ranges = rowNumbers.map(function(rowNumber) {
    return columnA1 + rowNumber;
  });

  sheet.getRangeList(ranges).setValue(value);
}

function archiveActiveShiftAssignmentsByCaseId_(
  caseId,
  caseStatus,
  updatedBy,
  now
) {
  const normalizedCaseStatus = String(caseStatus || '').trim().toLowerCase();

  if (
    normalizedCaseStatus !== 'cancelled' &&
    normalizedCaseStatus !== 'archived'
  ) {
    throw new Error('アサイン解除対象外の案件ステータスです: ' + caseStatus);
  }

  const changeReasonType = normalizedCaseStatus === 'archived'
    ? 'case_archived'
    : 'case_cancelled';
  const changeMemo = normalizedCaseStatus === 'archived'
    ? 'OrderCaseの案件アーカイブに連動して自動解除'
    : 'OrderCaseの案件キャンセルに連動して自動解除';
  const sheet = getShiftAssignmentsSheetForOrderCase_();
  const values = sheet.getDataRange().getValues();
  const plan = buildShiftAssignmentArchivePlan_(values, caseId);
  const rowNumbers = plan.target_row_numbers;

  if (rowNumbers.length === 0) {
    return {
      archived_count: 0,
      repaired_count: 0,
      remaining_active_count: 0
    };
  }

  const indexes = plan.header_indexes;
  const updatedAt = formatDate_(
    now || new Date(),
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  );
  const operator = String(updatedBy || 'OrderCase').trim() || 'OrderCase';

  // 監査情報を先に、無効化フラグを最後に書く。
  // 途中失敗時は行がactiveのまま残るか、案件無効化理由で再試行対象になる。
  setShiftAssignmentColumnValueForRows_(sheet, rowNumbers, indexes.updated_at, updatedAt);
  setShiftAssignmentColumnValueForRows_(sheet, rowNumbers, indexes.updated_by, operator);
  setShiftAssignmentColumnValueForRows_(sheet, rowNumbers, indexes.change_reason_type, changeReasonType);
  setShiftAssignmentColumnValueForRows_(sheet, rowNumbers, indexes.change_memo, changeMemo);
  setShiftAssignmentColumnValueForRows_(sheet, rowNumbers, indexes.assignment_status, 'archived');
  setShiftAssignmentColumnValueForRows_(sheet, rowNumbers, indexes.archived, true);

  SpreadsheetApp.flush();

  const verification = buildShiftAssignmentArchivePlan_(
    sheet.getDataRange().getValues(),
    caseId
  );

  if (
    verification.active_row_numbers.length > 0 ||
    verification.repair_row_numbers.length > 0
  ) {
    throw new Error(
      '案件無効化後も未解除または不完全なアサインが残っています: ' +
      verification.target_row_numbers.length + '件'
    );
  }

  return {
    archived_count: plan.active_row_numbers.length,
    repaired_count: plan.repair_row_numbers.length,
    remaining_active_count: 0
  };
}

function syncDraftShiftAssignmentTimesByCaseId_(caseId, commonTimes, caseDateTimes, updatedBy, now) {
  const sheet = getShiftAssignmentsSheetForOrderCase_();
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return { updated_count: 0, protected_count: 0 };
  }

  const headers = values[0].map(function(header) { return String(header || '').trim(); });
  const requiredHeaders = [
    'assignment_id', 'case_id', 'case_date_id', 'assignment_status', 'start_time', 'end_time',
    'updated_at', 'updated_by', 'archived'
  ];
  const indexes = {};
  requiredHeaders.forEach(function(header) {
    const index = headers.indexOf(header);
    if (index === -1) throw new Error('shift_assignments に必須列がありません: ' + header);
    indexes[header] = index;
  });

  const effectiveByDateId = caseDateTimes || {};
  const commonStart = String((commonTimes || {}).start_time || '').trim();
  const commonEnd = String((commonTimes || {}).end_time || '').trim();
  const operator = String(updatedBy || 'OrderCase').trim() || 'OrderCase';
  const updatedAt = formatDate_(now || new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  let updatedCount = 0;
  let protectedCount = 0;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    if (String(row[indexes.case_id] || '').trim() !== String(caseId || '').trim()) continue;

    const archived = row[indexes.archived] === true ||
      String(row[indexes.archived] || '').trim().toLowerCase() === 'true';
    const status = String(row[indexes.assignment_status] || '').trim().toLowerCase();
    if (archived || status === 'archived' || status === 'cancelled') continue;

    // 未確定と明示された draft だけ自動更新する。空欄や変更待ち、確定・公開状態は
    // 意味を推測せず保護する。別GASで同時に操作されるため、直前にも再確認する。
    if (status !== 'draft') {
      protectedCount += 1;
      continue;
    }

    const caseDateId = String(row[indexes.case_date_id] || '').trim();
    const dateTimes = effectiveByDateId[caseDateId] || {};
    const nextStart = String(dateTimes.start_time || commonStart).trim();
    const nextEnd = String(dateTimes.end_time || commonEnd).trim();
    if (
      String(row[indexes.start_time] || '').trim() === nextStart &&
      String(row[indexes.end_time] || '').trim() === nextEnd
    ) continue;

    const rowNumber = rowIndex + 1;
    const liveRow = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    if (String(liveRow[indexes.assignment_id] || '').trim() !== String(row[indexes.assignment_id] || '').trim()) {
      throw new Error('アサイン行の並び順が変わったため、時刻同期を中止しました。');
    }
    const liveArchived = liveRow[indexes.archived] === true ||
      String(liveRow[indexes.archived] || '').trim().toLowerCase() === 'true';
    const liveStatus = String(liveRow[indexes.assignment_status] || '').trim().toLowerCase();
    if (liveArchived || liveStatus === 'archived' || liveStatus === 'cancelled') continue;
    if (liveStatus !== 'draft') {
      protectedCount += 1;
      continue;
    }

    // 行全体を古い値で書き戻さず、今回の責務である時刻と監査列だけを更新する。
    sheet.getRange(rowNumber, indexes.start_time + 1).setValue(nextStart);
    sheet.getRange(rowNumber, indexes.end_time + 1).setValue(nextEnd);
    sheet.getRange(rowNumber, indexes.updated_at + 1).setValue(updatedAt);
    sheet.getRange(rowNumber, indexes.updated_by + 1).setValue(operator);

    SpreadsheetApp.flush();
    const verifiedRow = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const verifiedStatus = String(verifiedRow[indexes.assignment_status] || '').trim().toLowerCase();
    if (
      String(verifiedRow[indexes.assignment_id] || '').trim() !== String(row[indexes.assignment_id] || '').trim() ||
      verifiedStatus !== 'draft' ||
      String(verifiedRow[indexes.start_time] || '').trim() !== nextStart ||
      String(verifiedRow[indexes.end_time] || '').trim() !== nextEnd
    ) {
      throw new Error('アサイン時刻の更新結果を確認できませんでした。');
    }
    updatedCount += 1;
  }

  if (updatedCount > 0) SpreadsheetApp.flush();
  return { updated_count: updatedCount, protected_count: protectedCount };
}
/****************************************************
 * 案件無効化連動アサイン解除 ここまで
 ****************************************************/


/****************************************************
 * normalizeSheetValue_ ここから
 * シートから読んだ値をAPI向けに整形
 ****************************************************/
function normalizeSheetValue_(header, value) {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  // チェックボックス・TRUE/FALSE文字列をboolean化
  if (value === true || value === false) {
    return value;
  }

  if (String(value).toUpperCase() === 'TRUE') {
    return true;
  }

  if (String(value).toUpperCase() === 'FALSE') {
    return false;
  }

  // 日付型の整形
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    if (isMonthHeader_(header)) {
      return formatDate_(value, 'yyyy-MM');
    }

    if (isDateHeader_(header)) {
      return formatDate_(value, 'yyyy-MM-dd');
    }

    if (isTimeHeader_(header)) {
      return formatDate_(value, 'HH:mm');
    }

    if (isDateTimeHeader_(header)) {
      return formatDate_(value, 'yyyy-MM-dd HH:mm:ss');
    }

    return formatDate_(value, 'yyyy-MM-dd HH:mm:ss');
  }

  return value;
}
/****************************************************
 * normalizeSheetValue_ ここまで
 ****************************************************/


/****************************************************
 * ヘッダー種別判定 ここから
 ****************************************************/
function isMonthHeader_(header) {
  return [
    'target_month'
  ].indexOf(header) !== -1;
}

function isDateHeader_(header) {
  return [
    'request_date',
    'reply_deadline',
    'work_date'
  ].indexOf(header) !== -1;
}

function isTimeHeader_(header) {
  return [
    'work_start_time',
    'work_end_time',
    'meeting_time'
  ].indexOf(header) !== -1;
}

function isDateTimeHeader_(header) {
  return [
    'created_at',
    'updated_at'
  ].indexOf(header) !== -1;
}
/****************************************************
 * ヘッダー種別判定 ここまで
 ****************************************************/
