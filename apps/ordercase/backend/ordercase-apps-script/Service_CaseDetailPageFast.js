/****************************************************
 * Service_CaseDetailPageFast.gs
 * 案件詳細画面用の高速取得処理
 ****************************************************/


/****************************************************
 * getCaseDetailPageDataFast_ ここから
 * 案件詳細・日付明細・変更履歴を1回で返す
 * case_id単位で60秒キャッシュする
 * force_refresh=1 の場合はキャッシュを使わず最新取得する
 ****************************************************/
function getCaseDetailPageDataFast_(caseId, params) {
  const safeCaseId = String(caseId || '').trim();
  const safeParams = params || {};

  if (!safeCaseId) {
    throw new Error('case_id が指定されていません。');
  }

  const forceRefresh =
    String(safeParams.force_refresh || '').trim() === '1' ||
    String(safeParams.forceRefresh || '').trim() === '1';

  const cache = CacheService.getScriptCache();
  const cacheKey = 'case_detail_page_' + safeCaseId;
  const cachedText = cache.get(cacheKey);

  if (!forceRefresh && cachedText) {
    try {
      return JSON.parse(cachedText);
    } catch (error) {
      // キャッシュ破損時は無視して再取得
    }
  }

  const caseRecord = findOneObjectByColumnValueFast_(SHEET_CASES, 'case_id', safeCaseId);

  if (!caseRecord) {
    throw new Error('案件が見つかりません: ' + safeCaseId);
  }

  const relatedDates = findObjectsByColumnValueFast_(SHEET_CASE_DATES, 'case_id', safeCaseId)
    .sort(function(a, b) {
      return String(a.work_date || '').localeCompare(String(b.work_date || ''));
    });

  const changeLogs = getCaseChangeLogsFast_(safeCaseId);

  caseRecord.case_dates = relatedDates;

  const pageData = {
    case_detail: caseRecord,
    change_logs: changeLogs
  };

  cache.put(cacheKey, JSON.stringify(pageData), 60);

  return pageData;
}
/****************************************************
 * getCaseDetailPageDataFast_ ここまで
 ****************************************************/


/****************************************************
 * getCaseChangeLogsFast_ ここから
 * 指定案件の変更履歴だけを取得する
 ****************************************************/
function getCaseChangeLogsFast_(caseId) {
  const safeCaseId = String(caseId || '').trim();

  if (!safeCaseId) {
    return [];
  }

  const sheetName = getCaseChangeLogsSheetNameFast_();

  if (!sheetName) {
    // 変更履歴シート名が見つからない場合は既存関数に逃がす
    if (typeof getCaseChangeLogs_ === 'function') {
      return getCaseChangeLogs_(safeCaseId);
    }

    return [];
  }

  const logs = findObjectsByColumnValueFast_(sheetName, 'case_id', safeCaseId);

  logs.sort(function(a, b) {
    return String(b.changed_at || '').localeCompare(String(a.changed_at || ''));
  });

  return logs;
}
/****************************************************
 * getCaseChangeLogsFast_ ここまで
 ****************************************************/


/****************************************************
 * getCaseChangeLogsSheetNameFast_ ここから
 * 変更履歴シート名を既存定数から推定する
 ****************************************************/
function getCaseChangeLogsSheetNameFast_() {
  if (typeof SHEET_CASE_CHANGE_LOGS !== 'undefined' && SHEET_CASE_CHANGE_LOGS) {
    return SHEET_CASE_CHANGE_LOGS;
  }

  if (typeof SHEET_CASE_CHANGE_LOG !== 'undefined' && SHEET_CASE_CHANGE_LOG) {
    return SHEET_CASE_CHANGE_LOG;
  }

  if (typeof SHEET_CASE_LOGS !== 'undefined' && SHEET_CASE_LOGS) {
    return SHEET_CASE_LOGS;
  }

  if (typeof SHEET_CHANGE_LOGS !== 'undefined' && SHEET_CHANGE_LOGS) {
    return SHEET_CHANGE_LOGS;
  }

  return '';
}
/****************************************************
 * getCaseChangeLogsSheetNameFast_ ここまで
 ****************************************************/


/****************************************************
 * findOneObjectByColumnValueFast_ ここから
 * 指定列の値が一致する1件だけを取得する
 ****************************************************/
function findOneObjectByColumnValueFast_(sheetName, columnName, value) {
  const rows = findObjectsByColumnValueFast_(sheetName, columnName, value);
  return rows.length > 0 ? rows[0] : null;
}
/****************************************************
 * findOneObjectByColumnValueFast_ ここまで
 ****************************************************/


/****************************************************
 * findObjectsByColumnValueFast_ ここから
 * TextFinderで対象行だけ探し、該当行をオブジェクト化する
 ****************************************************/
function findObjectsByColumnValueFast_(sheetName, columnName, value) {
  const sheet = getSheetForUpdate_(sheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(header) {
      return String(header || '').trim();
    });

  const targetColumnIndex = headers.indexOf(columnName);

  if (targetColumnIndex === -1) {
    throw new Error(sheetName + ' シートに ' + columnName + ' 列がありません。');
  }

  const targetColumnNumber = targetColumnIndex + 1;

  const targetRange = sheet.getRange(2, targetColumnNumber, lastRow - 1, 1);
  const matches = targetRange
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .findAll();

  if (!matches || matches.length === 0) {
    return [];
  }

  const objects = [];

  matches.forEach(function(cell) {
    const rowNumber = cell.getRow();

    const row = sheet
      .getRange(rowNumber, 1, 1, lastColumn)
      .getValues()[0];

    objects.push(rowToObjectFast_(headers, row));
  });

  return objects;
}
/****************************************************
 * findObjectsByColumnValueFast_ ここまで
 ****************************************************/


/****************************************************
 * rowToObjectFast_ ここから
 * シート行をオブジェクト化する
 * Date型セルは表示用文字列に整形する
 ****************************************************/
function rowToObjectFast_(headers, row) {
  const obj = {};

  headers.forEach(function(header, index) {
    obj[header] = formatFastCellValue_(header, row[index]);
  });

  return obj;
}
/****************************************************
 * rowToObjectFast_ ここまで
 ****************************************************/


/****************************************************
 * formatFastCellValue_ ここから
 * 高速取得版のセル値整形
 ****************************************************/
function formatFastCellValue_(header, value) {
  if (value instanceof Date) {
    const key = String(header || '').trim();

    if (
      key === 'target_month' ||
      key === 'work_month'
    ) {
      return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM');
    }

    if (
      key === 'request_date' ||
      key === 'reply_deadline' ||
      key === 'work_date'
    ) {
      return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    if (
      key === 'created_at' ||
      key === 'updated_at' ||
      key === 'changed_at'
    ) {
      return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    }

    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }

  return value;
}
/****************************************************
 * formatFastCellValue_ ここまで
 ****************************************************/