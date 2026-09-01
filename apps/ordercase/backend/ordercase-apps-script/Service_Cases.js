/****************************************************
 * Service_Cases.gs
 * 案件本体 cases の処理
 ****************************************************/


/****************************************************
 * createCase_ ここから
 * 新規案件を作成する
 *
 * 方針：
 * - 基本、1案件 = 1人分 = ShiftBuilder上の1列
 * - same_condition_count が2以上の場合、同条件案件を複数作成する
 * - 複製案件は case_group_id / copy_index / copy_count で紐付ける
 * - 通知は代表1件のみ送る
 ****************************************************/
function createCase_(payload) {
  validateCreateCasePayload_(payload);

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    ensureCaseRankColumn_();
    ensureCaseDateConditionColumns_();
    ensureCaseLocationColumns_();
    ensureCaseCreateOperationColumns_();

    const sameConditionCount = normalizeSameConditionCount_(payload.same_condition_count);
    const alternateWorkerCount = normalizeAlternateWorkerCount_(payload, sameConditionCount);
    validateCaseDateConditionOverrides_(payload, sameConditionCount);
    const targetMonth = String(payload.target_month).trim();
    const inputMode = String(payload.input_mode || 'dates').trim();
    const operationId = normalizeCreateOperationId_(payload.create_operation_id);
    const payloadHash = buildCreateOperationPayloadHash_(payload);
    const replayResult = resolveCreateOperationReplay_(payload, {
      operation_id: operationId,
      payload_hash: payloadHash,
      same_condition_count: sameConditionCount,
      alternate_worker_count: alternateWorkerCount,
      input_mode: inputMode
    });

    if (replayResult) {
      return replayResult;
    }

    payload.create_operation_id = operationId;
    payload.create_payload_hash = payloadHash;

    const caseGroupId = sameConditionCount > 1
      ? generateCaseGroupId_(targetMonth)
      : '';

    const createdResults = [];
    let notificationCaseRecord = null;
    let notificationCaseDates = [];

for (let index = 1; index <= sameConditionCount; index++) {
  const copyInfo = sameConditionCount > 1
    ? {
        case_group_id: caseGroupId,
        copy_index: index,
        copy_count: sameConditionCount
      }
    : {
        case_group_id: '',
        copy_index: '',
        copy_count: ''
      };

  const isAlternateWorker = alternateWorkerCount > 0 && index > sameConditionCount - alternateWorkerCount;
  const singlePayload = buildSinglePersonCasePayload_(payload, copyInfo, {
    use_alternate_conditions: isAlternateWorker
  });

  const result = createSingleCase_(singlePayload, {
    send_notification: false
  });

      createdResults.push(result);

      if (index === 1) {
        notificationCaseRecord = result.case_record;
        notificationCaseDates = result.created_case_dates || [];
      }
    }

    if (notificationCaseRecord) {
      sendCreateCaseNotification_(
        notificationCaseRecord,
        notificationCaseDates,
        payload.created_by_email || ''
      );
    }

    return {
      case_id: createdResults.length > 0 ? createdResults[0].case_id : '',
      case_ids: createdResults.map(function(result) {
        return result.case_id;
      }),
      created_count: createdResults.length,
      created_case_dates_count: createdResults.reduce(function(total, result) {
        return total + Number(result.created_case_dates_count || 0);
      }, 0),
      input_mode: inputMode,
      same_condition_count: sameConditionCount,
      alternate_worker_count: alternateWorkerCount,
      case_group_id: caseGroupId,
      store_master: createdResults.length > 0 ? createdResults[0].store_master : null
    };

  } finally {
    lock.releaseLock();
  }
}
/****************************************************
 * createCase_ ここまで
 ****************************************************/

/****************************************************
 * createSingleCase_ ここから
 * 1人分の案件を1件作成する
 ****************************************************/
function createSingleCase_(payload, options) {
  const safeOptions = options || {};
  const now = new Date();

  const targetMonth = String(payload.target_month).trim();
  const caseId = generateCaseId_(targetMonth);

  const inputMode = String(payload.input_mode || 'dates').trim();

  const requiredLines = 1;
  const peoplePerLine = 1;
  const requiredPeople = 1;

  const storeInfo = ensureStoreMaster_(payload, caseId);

  const storeArea = storeInfo.store_area || payload.store_area || '';
  const workArea = payload.work_area || storeArea;
  const workLocation = payload.work_location || payload.store_name || storeInfo.store_name || '';

  const createdBy = payload.created_by || '';
  const createdByEmail = payload.created_by_email || '';

  const caseRecord = {
    case_id: caseId,
    target_month: targetMonth,
    request_date: payload.request_date || formatDate_(now, 'yyyy-MM-dd'),
    reply_deadline: payload.reply_deadline || '',

    status: payload.status || DEFAULT_CASE_STATUS,
    case_type: String(payload.case_type || '').trim(),
    case_rank: normalizeCaseRank_(payload.case_rank),
    input_mode: inputMode,

    agency_id: storeInfo.agency_id || '',
    agency_name: storeInfo.agency_name || payload.agency_name || '',
    store_id: storeInfo.store_id || '',
    store_name: storeInfo.store_name || payload.store_name || '',
    store_area: storeArea,

    work_location: workLocation,
    work_address: payload.work_address || '',
    work_nearest_station: payload.work_nearest_station || '',
    work_area: workArea,
    work_start_time: payload.work_start_time || '',
    work_end_time: payload.work_end_time || '',
    meeting_time: payload.meeting_time || '',
    meeting_place: payload.meeting_place || '',

    requested_days: inputMode === 'days' ? payload.requested_days : '',
    allocation_status: inputMode === 'days' ? DEFAULT_ALLOCATION_STATUS : '',

    required_lines: requiredLines,
    people_per_line: peoplePerLine,
    required_people: requiredPeople,
    required_skill: payload.required_skill || 'any',

    amount: payload.amount || '',
    amount_type: payload.amount_type || '',
    tax_type: payload.tax_type || '',
    amount_memo: payload.amount_memo || '',

    client_memo: payload.client_memo || '',
    internal_memo: payload.internal_memo || '',
    operation_memo: payload.operation_memo || '',

    for_shift_builder: normalizeSheetBoolean_(payload.for_shift_builder, true),
    shiftcore_display_name: String(payload.shiftcore_display_name || '').trim(),

    case_group_id: payload.case_group_id || '',
    copy_index: payload.copy_index || '',
    copy_count: payload.copy_count || '',
    create_operation_id: payload.create_operation_id || '',
    create_payload_hash: payload.create_payload_hash || '',

    created_at: now,
    created_by: createdBy,
    updated_at: now,
    updated_by: createdBy,
    archived: DEFAULT_ARCHIVED
  };

  appendObjectRow_(SHEET_CASES, caseRecord);

  let createdCaseDates = [];

  if (inputMode === 'dates') {
    createdCaseDates = createCaseDates_(caseId, targetMonth, payload.case_dates || [], {
      default_required_lines: requiredLines,
      default_people_per_line: peoplePerLine,
      force_single_person: true,
      now: now
    });
  }

  if (safeOptions.send_notification !== false) {
    sendCreateCaseNotification_(caseRecord, createdCaseDates, createdByEmail);
  }

  return {
    case_id: caseId,
    created_case_dates_count: createdCaseDates.length,
    created_case_dates: createdCaseDates,
    case_record: caseRecord,
    store_master: storeInfo
  };
}
/****************************************************
 * createSingleCase_ ここまで
 ****************************************************/


/****************************************************
 * ensureCaseRankColumn_ ここから
 * cases シートに case_rank 列を追加し、既存案件を B で補完する。
 ****************************************************/
function ensureCaseRankColumn_() {
  const sheet = getSheetForUpdate_(SHEET_CASES);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return String(header || '').trim();
  });

  let caseRankColumn = headers.indexOf('case_rank') + 1;

  if (caseRankColumn === 0) {
    caseRankColumn = lastColumn + 1;
    sheet.getRange(1, caseRankColumn).setValue('case_rank');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  const range = sheet.getRange(2, caseRankColumn, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;

  values.forEach(function(row) {
    if (!String(row[0] || '').trim()) {
      row[0] = 'B';
      changed = true;
    }
  });

  if (changed) {
    range.setValues(values);
  }
}
/****************************************************
 * ensureCaseRankColumn_ ここまで
 ****************************************************/

function ensureCaseDateConditionColumns_() {
  const sheet = getSheetForUpdate_(SHEET_CASE_DATES);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return String(header || '').trim();
  });
  const requiredHeaders = ['work_start_time', 'work_end_time', 'unit_amount_override'];
  let nextColumn = lastColumn + 1;

  requiredHeaders.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, nextColumn).setValue(header);
      nextColumn += 1;
    }
  });
}

function ensureCaseLocationColumns_() {
  const sheet = getSheetForUpdate_(SHEET_CASES);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  let nextColumn = lastColumn + 1;

  ['work_address', 'work_nearest_station'].forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, nextColumn).setValue(header);
      headers.push(header);
      nextColumn += 1;
    }
  });
}

/****************************************************
 * 案件作成の操作IDとpayloadハッシュを永続化する列を追加する。
 * 既存行は補完せず、新規作成分だけを再送判定の対象にする。
 ****************************************************/
function ensureCaseCreateOperationColumns_() {
  const sheet = getSheetForUpdate_(SHEET_CASES);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return String(header || '').trim();
  });
  const requiredHeaders = ['create_operation_id', 'create_payload_hash'];
  let nextColumn = lastColumn + 1;

  requiredHeaders.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, nextColumn).setValue(header);
      nextColumn += 1;
    }
  });
}

function normalizeCreateOperationId_(value) {
  const operationId = String(value || '').trim();

  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(operationId)) {
    throw new Error('案件作成の操作IDが不正です。画面を再読み込みしてから再度お試しください。');
  }

  return operationId;
}

function buildCreateOperationPayloadHash_(payload) {
  const canonicalPayload = canonicalizeCreateOperationValue_(payload, true);
  const rawPayload = JSON.stringify(canonicalPayload);

  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      rawPayload,
      Utilities.Charset.UTF_8
    )
  );
}

function canonicalizeCreateOperationValue_(value, isRoot) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return canonicalizeCreateOperationValue_(item, false);
    });
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object') {
    const normalized = {};

    Object.keys(value).sort().forEach(function(key) {
      if (isRoot && (
        key === 'create_operation_id' ||
        key === 'create_payload_hash' ||
        key === 'created_by'
      )) {
        return;
      }

      if (value[key] !== undefined) {
        normalized[key] = canonicalizeCreateOperationValue_(value[key], false);
      }
    });

    return normalized;
  }

  return value;
}

/****************************************************
 * 同じ操作IDの保存済み案件を返す。
 * 件数・日付明細が途中状態なら追記せず、手動確認が必要な状態として停止する。
 ****************************************************/
function resolveCreateOperationReplay_(payload, operation) {
  const existingCases = getSheetObjects_(SHEET_CASES).filter(function(row) {
    return String(row.create_operation_id || '').trim() === operation.operation_id;
  });

  if (existingCases.length === 0) {
    return null;
  }

  const hasDifferentPayload = existingCases.some(function(row) {
    return String(row.create_payload_hash || '').trim() !== operation.payload_hash;
  });

  if (hasDifferentPayload) {
    throw new Error('同じ操作IDで異なる案件内容が送信されました。画面を再読み込みして内容を確認してください。');
  }

  const sortedCases = existingCases.slice().sort(function(a, b) {
    return Number(a.copy_index || 1) - Number(b.copy_index || 1);
  });
  const caseIds = sortedCases.map(function(row) {
    return String(row.case_id || '').trim();
  });
  const uniqueCaseIds = {};
  caseIds.forEach(function(caseId) {
    if (caseId) uniqueCaseIds[caseId] = true;
  });

  const expectedDateCountPerCase = operation.input_mode === 'dates'
    ? (Array.isArray(payload.case_dates) ? payload.case_dates.filter(function(item) {
        return item && String(item.work_date || '').trim();
      }).length : 0)
    : 0;
  const existingDateCount = getSheetObjects_(SHEET_CASE_DATES).filter(function(row) {
    return uniqueCaseIds[String(row.case_id || '').trim()] === true;
  }).length;
  const expectedTotalDateCount = operation.same_condition_count * expectedDateCountPerCase;
  const isComplete = sortedCases.length === operation.same_condition_count &&
    Object.keys(uniqueCaseIds).length === operation.same_condition_count &&
    existingDateCount === expectedTotalDateCount;

  if (!isComplete) {
    throw new Error('前回の案件作成が途中状態です。重複防止のため追記を停止しました。管理者へ操作IDを添えて確認を依頼してください: ' + operation.operation_id);
  }

  const firstCase = sortedCases[0];

  return {
    case_id: caseIds[0],
    case_ids: caseIds,
    created_count: sortedCases.length,
    created_case_dates_count: existingDateCount,
    input_mode: operation.input_mode,
    same_condition_count: operation.same_condition_count,
    alternate_worker_count: operation.alternate_worker_count,
    case_group_id: String(firstCase.case_group_id || ''),
    store_master: {
      agency_id: firstCase.agency_id || '',
      agency_name: firstCase.agency_name || '',
      store_id: firstCase.store_id || '',
      store_name: firstCase.store_name || '',
      store_area: firstCase.store_area || ''
    },
    idempotent_replay: true
  };
}

/****************************************************
 * normalizeCaseRank_ ここから
 * 案件ランクを A / B / C に正規化する。既存案件の空欄は B と扱う。
 ****************************************************/
function normalizeCaseRank_(value) {
  const rank = String(value || 'B').trim().toUpperCase();

  if (['A', 'B', 'C'].indexOf(rank) === -1) {
    throw new Error('case_rank は A、B、C のいずれかにしてください。');
  }

  return rank;
}
/****************************************************
 * normalizeCaseRank_ ここまで
 ****************************************************/

/****************************************************
 * normalizeSameConditionCount_ ここから
 * 同条件作成件数を 1〜20 に正規化する
 ****************************************************/
function normalizeSameConditionCount_(value) {
  const rawValue = value === undefined || value === null || value === ''
    ? 1
    : Number(value);

  if (!isFinite(rawValue)) {
    throw new Error('同条件で作成する件数は数値で指定してください。');
  }

  if (!Number.isInteger(rawValue)) {
    throw new Error('同条件で作成する件数は整数で指定してください。');
  }

  const count = rawValue;
  if (count < 1) {
    throw new Error('同条件で作成する件数は1以上で指定してください。');
  }

  if (count > 20) {
    throw new Error('同条件で作成する件数は20件以下で指定してください。');
  }

  return count;
}
/****************************************************
 * normalizeSameConditionCount_ ここまで
 ****************************************************/

/****************************************************
 * normalizeSheetBoolean_ ここから
 * チェックボックス列へ保存する値を boolean に正規化する
 ****************************************************/
function normalizeSheetBoolean_(value, defaultValue) {
  if (value === true || value === false) {
    return value;
  }

  if (value === undefined || value === null || value === '') {
    return defaultValue === true;
  }

  const text = String(value).trim().toUpperCase();

  if (text === 'TRUE' || text === 'YES' || text === '1') {
    return true;
  }

  if (text === 'FALSE' || text === 'NO' || text === '0') {
    return false;
  }

  return defaultValue === true;
}
/****************************************************
 * normalizeSheetBoolean_ ここまで
 ****************************************************/

/****************************************************
 * buildSinglePersonCasePayload_ ここから
 * 1案件1人分としてpayloadを正規化する
 ****************************************************/
function buildSinglePersonCasePayload_(payload, copyInfo, options) {
  const safeCopyInfo = copyInfo || {};
  const safeOptions = options || {};
  const normalized = Object.assign({}, payload);

  normalized.required_lines = 1;
  normalized.people_per_line = 1;
  normalized.required_people = 1;

  normalized.case_group_id = safeCopyInfo.case_group_id || '';
  normalized.copy_index = safeCopyInfo.copy_index || '';
  normalized.copy_count = safeCopyInfo.copy_count || '';

  // 案件一式の総額を人数分の兄弟コマへ重複保存しない。
  if (payload.amount_type === 'per_case' && Number(safeCopyInfo.copy_index || 1) > 1) {
    normalized.amount = '';
  }

  if (safeOptions.use_alternate_conditions === true) {
    normalized.work_start_time = String(payload.alternate_work_start_time || '').trim();
    normalized.work_end_time = String(payload.alternate_work_end_time || '').trim();

    if (payload.alternate_amount_enabled === true || payload.alternate_amount_enabled === 'true') {
      normalized.amount = payload.alternate_amount;
    }
  }

  if (Array.isArray(payload.case_dates)) {
    normalized.case_dates = payload.case_dates.map(function(dateItem) {
      const dailyOverride = dateItem.has_condition_override === true || dateItem.has_condition_override === 'true';
      const dailyAlternateCount = dailyOverride && (dateItem.has_alternate_time_workers === true || dateItem.has_alternate_time_workers === 'true')
        ? Number(dateItem.alternate_worker_count || 0)
        : 0;
      const copyIndex = Number(safeCopyInfo.copy_index || 1);
      const copyCount = Number(safeCopyInfo.copy_count || 1);
      const useDailyAlternate = dailyAlternateCount > 0 && copyIndex > copyCount - dailyAlternateCount;
      const effectiveStart = dailyOverride
        ? String(useDailyAlternate ? dateItem.alternate_work_start_time : dateItem.work_start_time || '').trim()
        : normalized.work_start_time;
      const effectiveEnd = dailyOverride
        ? String(useDailyAlternate ? dateItem.alternate_work_end_time : dateItem.work_end_time || '').trim()
        : normalized.work_end_time;
      let unitAmountOverride = '';

      if (dailyOverride && payload.amount_type === 'per_person_day') {
        let effectiveAmount = payload.amount;
        if (useDailyAlternate) {
          if (dateItem.alternate_amount_enabled === true || dateItem.alternate_amount_enabled === 'true') {
            effectiveAmount = dateItem.alternate_amount;
          } else if (payload.alternate_amount_enabled === true || payload.alternate_amount_enabled === 'true') {
            effectiveAmount = payload.alternate_amount;
          }
        }
        if (String(effectiveAmount ?? '') !== String(normalized.amount ?? '')) {
          unitAmountOverride = effectiveAmount;
        }
      }

      return {
        work_date: dateItem.work_date,
        required_lines: 1,
        people_per_line: 1,
        required_people: 1,
        work_start_time: effectiveStart === normalized.work_start_time ? '' : effectiveStart,
        work_end_time: effectiveEnd === normalized.work_end_time ? '' : effectiveEnd,
        unit_amount_override: unitAmountOverride,
        memo: dateItem.memo || ''
      };
    });
  } else {
    normalized.case_dates = [];
  }

  return normalized;
}

function normalizeAlternateWorkerCount_(payload, totalCount) {
  const enabled = payload.has_alternate_time_workers === true ||
    payload.has_alternate_time_workers === 'true';

  if (!enabled) return 0;

  const count = Number(payload.alternate_worker_count);
  if (!Number.isInteger(count) || count < 1 || count >= totalCount) {
    throw new Error('異なる時間帯の人数は、1以上かつ必要人数未満にしてください。');
  }

  const start = String(payload.alternate_work_start_time || '').trim();
  const end = String(payload.alternate_work_end_time || '').trim();
  validateWorkTimeRange_(start, end, '異なる時間帯');

  if (start === String(payload.work_start_time || '').trim() && end === String(payload.work_end_time || '').trim()) {
    throw new Error('異なる時間帯には基本時間と違う時刻を入力してください。');
  }

  const hasAlternateAmount = payload.alternate_amount_enabled === true ||
    payload.alternate_amount_enabled === 'true';
  if (hasAlternateAmount) {
    if (payload.amount_type !== 'per_person_day') {
      throw new Error('異なる時間帯の別単価は「1コマ・1日あたり」の場合だけ設定できます。');
    }
    if (payload.alternate_amount === '' || payload.alternate_amount === null || payload.alternate_amount === undefined) {
      throw new Error('異なる時間帯の単価を入力してください。');
    }
    if (!Number.isFinite(Number(payload.alternate_amount)) || Number(payload.alternate_amount) < 0) {
      throw new Error('異なる時間帯の単価は0以上の数値で入力してください。');
    }
  }

  return count;
}

function validateWorkTimeRange_(start, end, label) {
  if (!start || !end) {
    throw new Error((label || '稼働時間') + 'の開始・終了時刻は必須です。');
  }

  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(start) || !timePattern.test(end)) {
    throw new Error((label || '稼働時間') + 'は HH:mm 形式で指定してください。');
  }

  if (end === start) {
    throw new Error((label || '稼働時間') + 'の開始・終了時刻を同じにはできません。');
  }

  // 終了が開始より早い場合は、終了を翌日として扱う共通契約。
  return end < start;
}

function validateAmountFields_(payload, allowLegacyTypes) {
  const allowedAmountTypes = ['', 'per_person_day', 'per_case'];
  if (allowLegacyTypes === true) {
    allowedAmountTypes.push('per_day', 'per_line_day');
  }
  const amountType = String(payload.amount_type || '').trim();
  if (allowedAmountTypes.indexOf(amountType) === -1) {
    throw new Error('金額区分が不正です。');
  }

  ['amount', 'alternate_amount'].forEach(function(field) {
    const value = payload[field];
    if (value === '' || value === null || value === undefined) return;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      throw new Error('金額は0以上の数値で入力してください。');
    }
  });

  if (payload.amount !== '' && payload.amount !== null && payload.amount !== undefined && !amountType) {
    throw new Error('金額を入力する前に金額区分を選択してください。');
  }
}

function validateCaseDateConditionOverrides_(payload, totalCount) {
  (payload.case_dates || []).forEach(function(dateItem) {
    const enabled = dateItem.has_condition_override === true || dateItem.has_condition_override === 'true';
    if (!enabled) return;

    const label = String(dateItem.work_date || '日別条件');
    validateWorkTimeRange_(
      String(dateItem.work_start_time || '').trim(),
      String(dateItem.work_end_time || '').trim(),
      label + ' の基本時間'
    );

    const hasAlternate = dateItem.has_alternate_time_workers === true || dateItem.has_alternate_time_workers === 'true';
    if (!hasAlternate) return;

    const alternateCount = Number(dateItem.alternate_worker_count);
    if (!Number.isInteger(alternateCount) || alternateCount < 1 || alternateCount >= totalCount) {
      throw new Error(label + ' の異時間者数は、1以上かつ必要人数未満にしてください。');
    }
    validateWorkTimeRange_(
      String(dateItem.alternate_work_start_time || '').trim(),
      String(dateItem.alternate_work_end_time || '').trim(),
      label + ' の異時間者時間'
    );

    const hasAmount = dateItem.alternate_amount_enabled === true || dateItem.alternate_amount_enabled === 'true';
    if (hasAmount && payload.amount_type !== 'per_person_day') {
      throw new Error(label + ' の別単価は「1コマ・1日あたり」の場合だけ設定できます。');
    }
    if (hasAmount && (dateItem.alternate_amount === '' || dateItem.alternate_amount === null || dateItem.alternate_amount === undefined)) {
      throw new Error(label + ' の異時間者単価を入力してください。');
    }
    if (hasAmount && (!Number.isFinite(Number(dateItem.alternate_amount)) || Number(dateItem.alternate_amount) < 0)) {
      throw new Error(label + ' の異時間者単価は0以上の数値で入力してください。');
    }
  });
}
/****************************************************
 * buildSinglePersonCasePayload_ ここまで
 ****************************************************/


/****************************************************
 * generateCaseGroupId_ ここから
 * 同条件複製グループIDを生成する
 ****************************************************/
function generateCaseGroupId_(targetMonth) {
  const ym = String(targetMonth || '').replace('-', '');
  const uuid = Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();

  return 'CG-' + ym + '-' + uuid;
}
/****************************************************
 * generateCaseGroupId_ ここまで
 ****************************************************/

/****************************************************
 * updateCase_ ここから
 * 既存案件を更新する
 *
 * v1編集範囲：
 * - cases シート本体を更新
 * - status が archived の場合は archived = TRUE に連動
 * - status が archived 以外の場合は archived = FALSE に連動
 * - sync_case_dates_required_people が TRUE の場合のみ case_dates の必要数も一括更新
 * - 更新前後の差分を case_change_logs に保存する
 ****************************************************/
function updateCase_(payload, options) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    ensureCaseRankColumn_();
    ensureCaseDateConditionColumns_();
    ensureCaseLocationColumns_();
    return updateCaseWithoutLock_(payload, options);
  } finally {
    lock.releaseLock();
  }
}

function updateCaseWithoutLock_(payload, options) {
  validateUpdateCasePayload_(payload);

  const safeOptions = options || {};

  const now = new Date();

  const caseId = String(payload.case_id || '').trim();

  const current = getCaseDetail_(caseId);
  const currentCaseRank = normalizeCaseRank_(current.case_rank);
  const nextCaseRank = normalizeCaseRank_(payload.case_rank || currentCaseRank);

  if (nextCaseRank !== currentCaseRank && safeOptions.can_change_case_rank !== true) {
    throw new Error('案件ランクを変更できるのは役員級のみです。');
  }

  const inputMode = String(payload.input_mode || current.input_mode || 'dates').trim();

  const requiredLines = toNumber_(payload.required_lines, current.required_lines || 1);
  const peoplePerLine = toNumber_(payload.people_per_line, current.people_per_line || 1);
  const requiredPeople = requiredLines * peoplePerLine;

  const currentRequiredLines = toNumber_(current.required_lines, 1);
  const currentPeoplePerLine = toNumber_(current.people_per_line, 1);
  const isLegacyMultiplePeopleCase = currentRequiredLines * currentPeoplePerLine > 1;
  if (
    (isLegacyMultiplePeopleCase && (
      requiredLines !== currentRequiredLines ||
      peoplePerLine !== currentPeoplePerLine
    )) ||
    (!isLegacyMultiplePeopleCase && (requiredLines !== 1 || peoplePerLine !== 1))
  ) {
    throw new Error('必要人数は編集できません。複数名は案件を人数分作成してください。');
  }

  const syncCaseDatesRequiredPeople =
    payload.sync_case_dates_required_people === true ||
    payload.sync_case_dates_required_people === 'true' ||
    payload.sync_case_dates_required_people === 'TRUE';

  const storeInfo = ensureStoreMaster_(payload, caseId);

  const storeArea = storeInfo.store_area || payload.store_area || current.store_area || '';
  const workArea = payload.work_area || storeArea;
  const workLocation = payload.work_location || payload.store_name || storeInfo.store_name || current.work_location || '';

  const updatedBy = payload.updated_by || payload.created_by || '画面編集';
  const updatedByEmail = payload.updated_by_email || payload.created_by_email || '';

  const nextStatus = payload.status || current.status || DEFAULT_CASE_STATUS;
  const normalizedNextStatus = String(nextStatus || '').trim().toLowerCase();
  const nextArchived = normalizedNextStatus === 'archived';
  const shouldCleanupAssignments =
    normalizedNextStatus === 'cancelled' ||
    normalizedNextStatus === 'archived';
  const caseDeactivationLabel = normalizedNextStatus === 'archived'
    ? 'アーカイブ'
    : 'キャンセル';

    const nextForShiftBuilder = normalizeSheetBoolean_(
    payload.for_shift_builder !== undefined && payload.for_shift_builder !== null && payload.for_shift_builder !== ''
      ? payload.for_shift_builder
      : current.for_shift_builder,
    true
  );

  const updateRecord = {
    target_month: String(payload.target_month || current.target_month || '').trim(),
    reply_deadline: payload.reply_deadline || '',

    status: nextStatus,
    case_type: String(payload.case_type || current.case_type || '').trim(),
    case_rank: nextCaseRank,
    input_mode: inputMode,

    agency_id: storeInfo.agency_id || current.agency_id || '',
    agency_name: storeInfo.agency_name || payload.agency_name || current.agency_name || '',
    store_id: storeInfo.store_id || current.store_id || '',
    store_name: storeInfo.store_name || payload.store_name || current.store_name || '',
    store_area: storeArea,

    work_location: workLocation,
    work_address: payload.work_address || '',
    work_nearest_station: payload.work_nearest_station || '',
    work_area: workArea,
    work_start_time: payload.work_start_time || '',
    work_end_time: payload.work_end_time || '',
    meeting_time: payload.meeting_time || '',
    meeting_place: payload.meeting_place || '',

    requested_days: inputMode === 'days' ? payload.requested_days : '',
    allocation_status: inputMode === 'days'
      ? (current.allocation_status || DEFAULT_ALLOCATION_STATUS)
      : '',

    required_lines: requiredLines,
    people_per_line: peoplePerLine,
    required_people: requiredPeople,
    required_skill: payload.required_skill || 'any',

    amount: payload.amount || '',
    amount_type: payload.amount_type || '',
    tax_type: payload.tax_type || '',
    amount_memo: payload.amount_memo || '',

    client_memo: payload.client_memo || '',
    internal_memo: payload.internal_memo || '',
    operation_memo: payload.operation_memo || '',

    for_shift_builder: nextForShiftBuilder,
    shiftcore_display_name: String(payload.shiftcore_display_name || current.shiftcore_display_name || '').trim(),

    updated_at: now,
    updated_by: updatedBy,
    updated_by_email: updatedByEmail,
    archived: nextArchived
  };

  const beforeRecord = Object.assign({}, current);
  const afterRecord = Object.assign({}, current, updateRecord);

  delete beforeRecord.case_dates;
  delete afterRecord.case_dates;

  let changedFieldsText = buildChangedFieldsText_(beforeRecord, afterRecord);

  if (syncCaseDatesRequiredPeople && inputMode === 'dates') {
    changedFieldsText += changedFieldsText ? '\n' : '';
    changedFieldsText += '日付明細の必要数: 全日付へ反映';
  }

  const caseDateConditionUpdates = buildCaseDateConditionUpdates_(payload, current.case_dates || []);
  if (caseDateConditionUpdates.length > 0) {
    changedFieldsText += changedFieldsText ? '\n' : '';
    changedFieldsText += '日別の時間・単価・メモ: ' + caseDateConditionUpdates.length + '日更新';
  }

  if (!changedFieldsText) {
    const assignmentTimeSync = syncCaseAssignmentTimesAfterCaseUpdate_(
      caseId,
      updateRecord,
      current.case_dates || [],
      [],
      updatedByEmail || updatedBy,
      now
    );
    const assignmentCleanup = shouldCleanupAssignments
      ? cleanupCaseAssignmentsAfterCaseDeactivation_(
          caseId,
          normalizedNextStatus,
          updatedByEmail || updatedBy,
          now
        )
      : buildSkippedCaseAssignmentCleanupResult_();

    return {
      case_id: caseId,
      case_saved: true,
      updated: false,
      assignment_cleanup_attempted: shouldCleanupAssignments,
      assignment_cleanup_succeeded: assignmentCleanup.succeeded,
      assignment_cleanup_error: assignmentCleanup.error,
      retry_required: assignmentCleanup.retry_required,
      archived_assignment_count: assignmentCleanup.archived_count,
      repaired_assignment_count: assignmentCleanup.repaired_count,
      remaining_active_assignment_count: assignmentCleanup.remaining_active_count,
      assignment_time_sync_attempted: assignmentTimeSync.attempted,
      assignment_time_sync_succeeded: assignmentTimeSync.succeeded,
      assignment_time_sync_error: assignmentTimeSync.error,
      updated_draft_assignment_time_count: assignmentTimeSync.updated_count,
      protected_assignment_time_count: assignmentTimeSync.protected_count,
      message: assignmentCleanup.succeeded
        ? (
            assignmentCleanup.archived_count > 0
              ? '変更差分はありませんが、残存アサインを解除しました。'
              : '変更差分がありませんでした。'
          )
        : '案件の' + caseDeactivationLabel +
          'は保存済みですが、アサイン解除の再試行が必要です。'
    };
  }

  createCaseChangeLog_({
    case_id: caseId,
    changed_at: now,
    changed_by: updatedBy,
    changed_by_email: updatedByEmail,
    changed_type: payload.change_type || CHANGE_TYPE_OTHER,
    change_reason: getChangeTypeName_(payload.change_type || CHANGE_TYPE_OTHER),
    changed_fields: changedFieldsText,
    before_snapshot: createSnapshotJson_(beforeRecord),
    after_snapshot: createSnapshotJson_(afterRecord),
    memo: payload.change_memo || ''
  });

  updateCaseRowByCaseId_(caseId, updateRecord);

  let updatedCaseDatesCount = 0;

  if (syncCaseDatesRequiredPeople && inputMode === 'dates') {
    updatedCaseDatesCount = updateCaseDatesRequiredPeopleByCaseId_(caseId, {
      required_lines: requiredLines,
      people_per_line: peoplePerLine,
      required_people: requiredPeople,
      updated_at: now
    });
  }

  if (caseDateConditionUpdates.length > 0 && inputMode === 'dates') {
    updateCaseDateConditionsByCaseId_(caseId, caseDateConditionUpdates, now);
    updatedCaseDatesCount = Math.max(updatedCaseDatesCount, caseDateConditionUpdates.length);
  }

  const commonTimeChanged =
    String(current.work_start_time || '') !== String(updateRecord.work_start_time || '') ||
    String(current.work_end_time || '') !== String(updateRecord.work_end_time || '');
  const dateTimeChanged = caseDateConditionUpdates.some(function(update) {
    const currentDate = (current.case_dates || []).find(function(date) {
      return String(date.case_date_id || '') === String(update.case_date_id || '');
    }) || {};
    return String(currentDate.work_start_time || '') !== String(update.work_start_time || '') ||
      String(currentDate.work_end_time || '') !== String(update.work_end_time || '');
  });
  const assignmentTimeSync = (commonTimeChanged || dateTimeChanged)
    ? syncCaseAssignmentTimesAfterCaseUpdate_(
        caseId,
        updateRecord,
        current.case_dates || [],
        caseDateConditionUpdates,
        updatedByEmail || updatedBy,
        now
      )
    : buildSkippedAssignmentTimeSyncResult_();

  const assignmentCleanup = shouldCleanupAssignments
    ? cleanupCaseAssignmentsAfterCaseDeactivation_(
        caseId,
        normalizedNextStatus,
        updatedByEmail || updatedBy,
        now
      )
    : buildSkippedCaseAssignmentCleanupResult_();

  return {
    case_id: caseId,
    case_saved: true,
    updated: true,
    updated_at: formatDate_(now, 'yyyy-MM-dd HH:mm:ss'),
    updated_by: updatedBy,
    updated_by_email: updatedByEmail,
    archived: nextArchived,
    changed_fields: changedFieldsText,
    updated_case_dates_count: updatedCaseDatesCount,
    assignment_cleanup_attempted: shouldCleanupAssignments,
    assignment_cleanup_succeeded: assignmentCleanup.succeeded,
    assignment_cleanup_error: assignmentCleanup.error,
    retry_required: assignmentCleanup.retry_required,
    archived_assignment_count: assignmentCleanup.archived_count,
    repaired_assignment_count: assignmentCleanup.repaired_count,
    remaining_active_assignment_count: assignmentCleanup.remaining_active_count,
    assignment_time_sync_attempted: assignmentTimeSync.attempted,
    assignment_time_sync_succeeded: assignmentTimeSync.succeeded,
    assignment_time_sync_error: assignmentTimeSync.error,
    updated_draft_assignment_time_count: assignmentTimeSync.updated_count,
    protected_assignment_time_count: assignmentTimeSync.protected_count
  };
}

function buildSkippedAssignmentTimeSyncResult_() {
  return {
    attempted: false,
    succeeded: true,
    error: '',
    updated_count: 0,
    protected_count: 0
  };
}

function syncCaseAssignmentTimesAfterCaseUpdate_(caseId, updateRecord, currentDates, updates, updatedBy, now) {
  const updatesById = {};
  (updates || []).forEach(function(update) {
    updatesById[String(update.case_date_id || '')] = update;
  });
  const effectiveByDateId = {};
  (currentDates || []).forEach(function(date) {
    const caseDateId = String(date.case_date_id || '');
    const next = updatesById[caseDateId] || date;
    effectiveByDateId[caseDateId] = {
      start_time: String(next.work_start_time || updateRecord.work_start_time || '').trim(),
      end_time: String(next.work_end_time || updateRecord.work_end_time || '').trim()
    };
  });

  try {
    const result = syncDraftShiftAssignmentTimesByCaseId_(
      caseId,
      {
        start_time: updateRecord.work_start_time,
        end_time: updateRecord.work_end_time
      },
      effectiveByDateId,
      updatedBy,
      now
    );
    return {
      attempted: true,
      succeeded: true,
      error: '',
      updated_count: result.updated_count,
      protected_count: result.protected_count
    };
  } catch (error) {
    console.error('[OrderCase] assignment time sync failed: ' + caseId + ' / ' + error.message);
    return {
      attempted: true,
      succeeded: false,
      error: String(error && error.message ? error.message : error),
      updated_count: null,
      protected_count: null
    };
  }
}
/****************************************************
 * updateCase_ ここまで
 ****************************************************/

function buildSkippedCaseAssignmentCleanupResult_() {
  return {
    succeeded: true,
    error: '',
    retry_required: false,
    archived_count: 0,
    repaired_count: 0,
    remaining_active_count: 0
  };
}

function cleanupCaseAssignmentsAfterCaseDeactivation_(
  caseId,
  caseStatus,
  updatedBy,
  now
) {
  try {
    const result = archiveActiveShiftAssignmentsByCaseId_(
      caseId,
      caseStatus,
      updatedBy,
      now
    );

    return {
      succeeded: true,
      error: '',
      retry_required: false,
      archived_count: result.archived_count,
      repaired_count: result.repaired_count,
      remaining_active_count: result.remaining_active_count
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);

    console.error(
      '[OrderCase] inactive case assignment cleanup failed: ' +
      caseId + ' (' + caseStatus + ') / ' + message
    );

    return {
      succeeded: false,
      error: message,
      retry_required: true,
      archived_count: null,
      repaired_count: null,
      remaining_active_count: null
    };
  }
}



/****************************************************
 * validateCreateCasePayload_ ここから
 * 新規案件登録payloadの最低限チェック
 ****************************************************/
function validateCreateCasePayload_(payload) {
  const requiredFields = [
    'target_month',
    'case_type',
    'case_rank',
    'input_mode',
    'agency_name',
    'store_name',
    'store_area',
    'required_lines',
    'people_per_line'
  ];

  requiredFields.forEach(function(field) {
    if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
      throw new Error('必須項目が不足しています: ' + field);
    }
  });

  normalizeCreateOperationId_(payload.create_operation_id);

  normalizeCaseRank_(payload.case_rank);
  validateAmountFields_(payload, false);
  validateWorkTimeRange_(
    String(payload.work_start_time || '').trim(),
    String(payload.work_end_time || '').trim(),
    '基本時間'
  );

  if (!String(payload.shiftcore_display_name || '').trim()) {
    throw new Error('Another Portal表示用省略名称が必要です。');
  }

  if (payload.input_mode !== 'dates' && payload.input_mode !== 'days') {
    throw new Error('input_mode は dates または days にしてください。');
  }

  if (payload.input_mode === 'dates') {
    if (!Array.isArray(payload.case_dates) || payload.case_dates.length === 0) {
      throw new Error('日付指定の場合、case_dates が1件以上必要です。');
    }
  }

  if (payload.input_mode === 'days') {
    if (!payload.requested_days) {
      throw new Error('日数指定の場合、requested_days が必要です。');
    }
  }
}
/****************************************************
 * validateCreateCasePayload_ ここまで
 ****************************************************/


/****************************************************
 * validateUpdateCasePayload_ ここから
 * 案件更新payloadの最低限チェック
 ****************************************************/
function validateUpdateCasePayload_(payload) {
  const requiredFields = [
    'case_id',
    'target_month',
    'case_type',
    'input_mode',
    'agency_name',
    'store_name',
    'store_area',
    'required_lines',
    'people_per_line'
  ];

  requiredFields.forEach(function(field) {
    if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
      throw new Error('必須項目が不足しています: ' + field);
    }
  });

  normalizeCaseRank_(payload.case_rank);
  validateAmountFields_(payload, true);
  validateWorkTimeRange_(
    String(payload.work_start_time || '').trim(),
    String(payload.work_end_time || '').trim(),
    '基本時間'
  );

  if (!String(payload.shiftcore_display_name || '').trim()) {
    throw new Error('Another Portal表示用省略名称が必要です。');
  }

  if (payload.input_mode !== 'dates' && payload.input_mode !== 'days') {
    throw new Error('input_mode は dates または days にしてください。');
  }

  if (payload.input_mode === 'days') {
    if (!payload.requested_days) {
      throw new Error('日数指定の場合、requested_days が必要です。');
    }
  }
}
/****************************************************
 * validateUpdateCasePayload_ ここまで
 ****************************************************/


/****************************************************
 * listCases_ ここから
 * 案件一覧を返す
 *
 * 条件なし：
 * - archived 以外
 * - 新しい順
 * - 最新100件
 *
 * 条件あり：
 * - target_month / keyword / status / case_type で絞り込み
 * - limit上限は300件
 *
 * archived の扱い：
 * - 通常表示では archived = TRUE を除外
 * - status = archived で検索した場合のみ archived = TRUE を表示対象にする
 ****************************************************/
function listCases_(params) {
  const safeParams = params || {};

  const targetMonth = String(safeParams.target_month || '').trim();
  const keyword = String(safeParams.keyword || '').trim().toLowerCase();
  const status = String(safeParams.status || '').trim();
  const caseType = String(safeParams.case_type || '').trim();

  const hasSearchCondition =
    targetMonth !== '' ||
    keyword !== '' ||
    status !== '' ||
    caseType !== '';

  const limit = hasSearchCondition ? 300 : 100;

  const cases = getSheetObjects_(SHEET_CASES);
  const caseDates = getSheetObjects_(SHEET_CASE_DATES);

  const isSearchingArchived = status === 'archived';

  const filteredCases = cases
    .filter(function(row) {
      const isArchived = String(row.archived || 'FALSE').toUpperCase() === 'TRUE';

      if (isArchived && !isSearchingArchived) {
        return false;
      }

      if (!isArchived && isSearchingArchived) {
        return false;
      }

      if (targetMonth && String(row.target_month || '') !== targetMonth) {
        return false;
      }

      if (status && String(row.status || '') !== status) {
        return false;
      }

      if (caseType && String(row.case_type || '') !== caseType) {
        return false;
      }

      if (keyword) {
        const target = [
          row.case_id,
          row.target_month,
          row.agency_name,
          row.store_name,
          row.store_area,
          row.work_location,
          row.work_area,
          row.client_memo,
          row.internal_memo,
          row.operation_memo
        ].join(' ').toLowerCase();

        if (!target.includes(keyword)) {
          return false;
        }
      }

      return true;
    })
    .sort(function(a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    })
    .slice(0, limit);

  const targetCaseIdMap = {};

  filteredCases.forEach(function(caseRow) {
    targetCaseIdMap[String(caseRow.case_id)] = true;
  });

  const groupedDates = {};

  caseDates.forEach(function(dateRow) {
    const caseId = String(dateRow.case_id || '');

    if (!targetCaseIdMap[caseId]) {
      return;
    }

    if (!groupedDates[caseId]) {
      groupedDates[caseId] = [];
    }

    groupedDates[caseId].push(dateRow);
  });

  Object.keys(groupedDates).forEach(function(caseId) {
    groupedDates[caseId].sort(function(a, b) {
      return String(a.work_date || '').localeCompare(String(b.work_date || ''));
    });
  });

  return filteredCases.map(function(caseRow) {
    caseRow.case_dates = groupedDates[String(caseRow.case_id)] || [];
    return caseRow;
  });
}
/****************************************************
 * listCases_ ここまで
 ****************************************************/


/****************************************************
 * getCaseDetail_ ここから
 * 1案件の詳細情報を返す
 ****************************************************/
function getCaseDetail_(caseId) {
  if (!caseId) {
    throw new Error('case_id が指定されていません。');
  }

  const cases = getSheetObjects_(SHEET_CASES);
  const caseDates = getSheetObjects_(SHEET_CASE_DATES);

  const caseRecord = cases.find(function(row) {
    return String(row.case_id || '') === String(caseId);
  });

  if (!caseRecord) {
    throw new Error('案件が見つかりません: ' + caseId);
  }

  const relatedDates = caseDates
    .filter(function(row) {
      return String(row.case_id || '') === String(caseId);
    })
    .sort(function(a, b) {
      return String(a.work_date || '').localeCompare(String(b.work_date || ''));
    });

  caseRecord.case_dates = relatedDates;

  return caseRecord;
}
/****************************************************
 * getCaseDetail_ ここまで
 ****************************************************/


/****************************************************
 * updateCaseRowByCaseId_ ここから
 * cases シートの該当case_id行を更新する
 ****************************************************/
function updateCaseRowByCaseId_(caseId, updateRecord) {
  const sheet = getSheetForUpdate_(SHEET_CASES);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error('cases シートにデータがありません。');
  }

  const headers = values[0].map(function(header) {
    return String(header || '').trim();
  });

  const caseIdColumnIndex = headers.indexOf('case_id');

  if (caseIdColumnIndex === -1) {
    throw new Error('cases シートに case_id 列がありません。');
  }

  let targetRowNumber = -1;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][caseIdColumnIndex] || '') === String(caseId)) {
      targetRowNumber = i + 1;
      break;
    }
  }

  if (targetRowNumber === -1) {
    throw new Error('更新対象の案件が見つかりません: ' + caseId);
  }

  const currentRowValues = sheet
    .getRange(targetRowNumber, 1, 1, headers.length)
    .getValues()[0];

  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(updateRecord, header)) {
      currentRowValues[index] = updateRecord[header];
    }
  });

  const targetRange = sheet.getRange(targetRowNumber, 1, 1, headers.length);
  const validations = targetRange.getDataValidations()[0];
  const normalizedRowValues = normalizeCheckboxRowValues_(currentRowValues, validations);

  targetRange.setValues([normalizedRowValues]);
}
/****************************************************
 * updateCaseRowByCaseId_ ここまで
 ****************************************************/

function buildCaseDateConditionUpdates_(payload, currentDates) {
  if (!Array.isArray(payload.case_dates)) return [];

  const currentById = {};
  (currentDates || []).forEach(function(date) {
    currentById[String(date.case_date_id || '')] = date;
  });

  return payload.case_dates.map(function(date) {
    const caseDateId = String(date.case_date_id || '').trim();
    const current = currentById[caseDateId];
    if (!caseDateId || !current) {
      throw new Error('更新対象の日付明細が見つかりません: ' + caseDateId);
    }

    const start = String(date.work_start_time || '').trim();
    const end = String(date.work_end_time || '').trim();
    if (start || end) validateWorkTimeRange_(start, end, String(date.work_date || '') + ' の日別時間');

    const amount = date.unit_amount_override === null || date.unit_amount_override === undefined
      ? ''
      : String(date.unit_amount_override).trim();
    if (amount && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
      throw new Error(String(date.work_date || '') + ' の日別単価は0以上の数値で入力してください。');
    }
    if (amount && payload.amount_type !== 'per_person_day') {
      throw new Error(String(date.work_date || '') + ' の日別単価は「1コマ・1日あたり」の場合だけ設定できます。');
    }

    const next = {
      case_date_id: caseDateId,
      work_start_time: start,
      work_end_time: end,
      unit_amount_override: amount,
      memo: String(date.memo || '')
    };
    const changed = ['work_start_time', 'work_end_time', 'unit_amount_override', 'memo'].some(function(field) {
      return String(current[field] || '') !== String(next[field] || '');
    });
    return changed ? next : null;
  }).filter(function(update) {
    return update !== null;
  });
}

function updateCaseDateConditionsByCaseId_(caseId, updates, now) {
  const sheet = getSheetForUpdate_(SHEET_CASE_DATES);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(header) { return String(header || '').trim(); });
  const caseIdIndex = headers.indexOf('case_id');
  const caseDateIdIndex = headers.indexOf('case_date_id');
  const updatesById = {};
  updates.forEach(function(update) { updatesById[update.case_date_id] = update; });
  let updatedCount = 0;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][caseIdIndex] || '') !== String(caseId)) continue;
    const update = updatesById[String(values[rowIndex][caseDateIdIndex] || '')];
    if (!update) continue;
    ['work_start_time', 'work_end_time', 'unit_amount_override', 'memo'].forEach(function(field) {
      const columnIndex = headers.indexOf(field);
      if (columnIndex >= 0) values[rowIndex][columnIndex] = update[field];
    });
    const updatedAtIndex = headers.indexOf('updated_at');
    if (updatedAtIndex >= 0) values[rowIndex][updatedAtIndex] = now;
    sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([values[rowIndex]]);
    updatedCount += 1;
  }
  return updatedCount;
}

/****************************************************
 * normalizeCheckboxRowValues_ ここから
 * チェックボックス列へ保存する値をbooleanへ正規化する
 ****************************************************/
function normalizeCheckboxRowValues_(rowValues, validations) {
  return rowValues.map(function(value, index) {
    const validation = validations[index];

    if (!validation) {
      return value;
    }

    const criteriaType = validation.getCriteriaType();

    if (criteriaType !== SpreadsheetApp.DataValidationCriteria.CHECKBOX) {
      return value;
    }

    if (value === true || value === false) {
      return value;
    }

    if (value === '' || value === null || value === undefined) {
      return false;
    }

    const text = String(value).trim().toUpperCase();

    if (text === 'TRUE' || text === 'YES' || text === '1') {
      return true;
    }

    if (text === 'FALSE' || text === 'NO' || text === '0') {
      return false;
    }

    return false;
  });
}
/****************************************************
 * normalizeCheckboxRowValues_ ここまで
 ****************************************************/

/****************************************************
 * getSheetForUpdate_ ここから
 * 更新用にシートを取得する
 *
 * 既存プロジェクトの構成差を吸収するため、
 * 1. getSheet_ があればそれを使う
 * 2. SPREADSHEET_ID 系の定数があれば openById する
 * 3. 最後にアクティブSSを使う
 ****************************************************/
function getSheetForUpdate_(sheetName) {
  if (typeof getSheet_ === 'function') {
    return getSheet_(sheetName);
  }

  let ss = null;

  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID) {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } else if (typeof ORDERCASE_SPREADSHEET_ID !== 'undefined' && ORDERCASE_SPREADSHEET_ID) {
    ss = SpreadsheetApp.openById(ORDERCASE_SPREADSHEET_ID);
  } else if (typeof MASTER_SPREADSHEET_ID !== 'undefined' && MASTER_SPREADSHEET_ID) {
    ss = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  if (!ss) {
    throw new Error('スプレッドシートを取得できません。');
  }

  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('シートが見つかりません: ' + sheetName);
  }

  return sheet;
}
/****************************************************
 * getSheetForUpdate_ ここまで
 ****************************************************/


/****************************************************
 * generateCaseId_ ここから
 * CASE-YYYYMM-0001 形式の案件IDを生成
 ****************************************************/
function generateCaseId_(targetMonth) {
  const ym = String(targetMonth).replace('-', '');
  const prefix = 'CASE-' + ym + '-';

  const rows = getSheetObjects_(SHEET_CASES);

  const count = rows.filter(function(row) {
    return String(row.case_id || '').indexOf(prefix) === 0;
  }).length;

  return prefix + String(count + 1).padStart(4, '0');
}
/****************************************************
 * generateCaseId_ ここまで
 ****************************************************/

 /****************************************************
 * updateCaseDatesRequiredPeopleByCaseId_ ここから
 * 指定案件の case_dates の必要数を一括更新する
 ****************************************************/
function updateCaseDatesRequiredPeopleByCaseId_(caseId, params) {
  const safeCaseId = String(caseId || '').trim();

  if (!safeCaseId) {
    throw new Error('case_dates 更新に case_id が必要です。');
  }

  const sheet = getSheetForUpdate_(SHEET_CASE_DATES);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return 0;
  }

  const headers = values[0].map(function(header) {
    return String(header || '').trim();
  });

  const caseIdColumnIndex = headers.indexOf('case_id');

  if (caseIdColumnIndex === -1) {
    throw new Error('case_dates シートに case_id 列がありません。');
  }

  const requiredLinesIndex = headers.indexOf('required_lines');
  const peoplePerLineIndex = headers.indexOf('people_per_line');
  const requiredPeopleIndex = headers.indexOf('required_people');
  const updatedAtIndex = headers.indexOf('updated_at');

  let updatedCount = 0;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][caseIdColumnIndex] || '') !== safeCaseId) {
      continue;
    }

    if (requiredLinesIndex !== -1) {
      values[i][requiredLinesIndex] = params.required_lines;
    }

    if (peoplePerLineIndex !== -1) {
      values[i][peoplePerLineIndex] = params.people_per_line;
    }

    if (requiredPeopleIndex !== -1) {
      values[i][requiredPeopleIndex] = params.required_people;
    }

    if (updatedAtIndex !== -1) {
      values[i][updatedAtIndex] = params.updated_at || new Date();
    }

    updatedCount++;
  }

  if (updatedCount > 0) {
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  }

  return updatedCount;
}
/****************************************************
 * updateCaseDatesRequiredPeopleByCaseId_ ここまで
 ****************************************************/
