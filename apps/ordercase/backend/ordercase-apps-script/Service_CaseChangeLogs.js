/****************************************************
 * Service_CaseChangeLogs.gs
 * 案件変更ログ case_change_logs の処理
 ****************************************************/


/****************************************************
 * createCaseChangeLog_ ここから
 * 案件編集時の変更ログを保存する
 ****************************************************/
function createCaseChangeLog_(params) {
  const safeParams = params || {};

  const caseId = String(safeParams.case_id || '').trim();

  if (!caseId) {
    throw new Error('変更ログ作成に case_id が必要です。');
  }

  const now = safeParams.changed_at || new Date();

  const record = {
    log_id: generateCaseChangeLogId_(),
    case_id: caseId,
    changed_at: now,
    changed_by: safeParams.changed_by || '画面編集',
    changed_by_email: safeParams.changed_by_email || '',
    changed_type: safeParams.changed_type || CHANGE_TYPE_OTHER,
    change_reason: safeParams.change_reason || getChangeTypeName_(safeParams.changed_type || CHANGE_TYPE_OTHER),
    changed_fields: safeParams.changed_fields || '',
    before_snapshot: safeParams.before_snapshot || '',
    after_snapshot: safeParams.after_snapshot || '',
    memo: safeParams.memo || ''
  };

  appendObjectRow_(SHEET_CASE_CHANGE_LOGS, record);

  return record;
}
/****************************************************
 * createCaseChangeLog_ ここまで
 ****************************************************/


/****************************************************
 * buildChangedFieldsText_ ここから
 * 変更前後の案件データを比較して差分テキストを作る
 ****************************************************/
function buildChangedFieldsText_(beforeRecord, afterRecord) {
  const beforeSafe = beforeRecord || {};
  const afterSafe = afterRecord || {};

  const labels = getCaseFieldLabels_();
  const fields = Object.keys(labels);

  const changedLines = [];

  fields.forEach(function(field) {
    const beforeValue = normalizeLogValue_(beforeSafe[field]);
    const afterValue = normalizeLogValue_(afterSafe[field]);

    if (beforeValue !== afterValue) {
      changedLines.push(
        labels[field] + ': ' + displayLogValue_(beforeSafe[field]) + ' → ' + displayLogValue_(afterSafe[field])
      );
    }
  });

  return changedLines.join('\n');
}
/****************************************************
 * buildChangedFieldsText_ ここまで
 ****************************************************/


/****************************************************
 * hasChangedFields_ ここから
 * 差分があるかどうかを判定する
 ****************************************************/
function hasChangedFields_(beforeRecord, afterRecord) {
  const text = buildChangedFieldsText_(beforeRecord, afterRecord);
  return text !== '';
}
/****************************************************
 * hasChangedFields_ ここまで
 ****************************************************/


/****************************************************
 * createSnapshotJson_ ここから
 * スナップショット保存用JSONを作る
 ****************************************************/
function createSnapshotJson_(record) {
  return JSON.stringify(record || {});
}
/****************************************************
 * createSnapshotJson_ ここまで
 ****************************************************/


/****************************************************
 * generateCaseChangeLogId_ ここから
 * LOG-YYYYMMDD-0001 形式の変更ログIDを生成する
 ****************************************************/
function generateCaseChangeLogId_() {
  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMdd'
  );

  const prefix = 'LOG-' + today + '-';

  const rows = getSheetObjects_(SHEET_CASE_CHANGE_LOGS);

  const count = rows.filter(function(row) {
    return String(row.log_id || '').indexOf(prefix) === 0;
  }).length;

  return prefix + String(count + 1).padStart(4, '0');
}
/****************************************************
 * generateCaseChangeLogId_ ここまで
 ****************************************************/


/****************************************************
 * getChangeTypeName_ ここから
 * 変更種別の表示名を返す
 ****************************************************/
function getChangeTypeName_(value) {
  const map = {
    correction: '誤入力の修正',
    condition_change: '発注条件変更',
    status_change: 'ステータス変更',
    internal_note: '社内メモ更新',
    other: 'その他'
  };

  return map[value] || 'その他';
}
/****************************************************
 * getChangeTypeName_ ここまで
 ****************************************************/


/****************************************************
 * getCaseFieldLabels_ ここから
 * 差分ログで表示する cases の項目名
 ****************************************************/
function getCaseFieldLabels_() {
  return {
    target_month: '対象月',
    reply_deadline: '返答期限',
    status: 'ステータス',
    case_type: '案件種別',
    input_mode: '入力方式',

    agency_id: '代理店ID',
    agency_name: '代理店名',
    store_id: '店舗ID',
    store_name: '店舗名',
    store_area: '連携店舗エリア',

    work_location: '実稼働場所',
    work_area: '実稼働エリア',
    work_start_time: '稼働開始時間',
    work_end_time: '稼働終了時間',
    meeting_time: '集合時間',
    meeting_place: '集合場所',

    requested_days: '希望日数',
    allocation_status: '割当状況',

    required_lines: '必要枠数',
    people_per_line: '1枠あたり人数',
    required_people: '必要人数',
    required_skill: '必要スキル',

    amount: '金額',
    amount_type: '金額区分',
    tax_type: '税区分',
    amount_memo: '金額メモ',

    client_memo: '先方メモ',
    internal_memo: '社内メモ',
    operation_memo: '運用メモ',

    for_shift_builder: 'ShiftBuilder対象',
    archived: 'アーカイブ'
  };
}
/****************************************************
 * getCaseFieldLabels_ ここまで
 ****************************************************/


/****************************************************
 * normalizeLogValue_ ここから
 * 差分比較用に値を正規化する
 ****************************************************/
function normalizeLogValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    );
  }

  return String(value).trim();
}
/****************************************************
 * normalizeLogValue_ ここまで
 ****************************************************/


/****************************************************
 * displayLogValue_ ここから
 * 差分ログ表示用の値に変換する
 ****************************************************/
function displayLogValue_(value) {
  const normalized = normalizeLogValue_(value);

  if (normalized === '') {
    return '（空欄）';
  }

  return normalized;
}
/****************************************************
 * displayLogValue_ ここまで
 ****************************************************/

 /****************************************************
 * getCaseChangeLogs_ ここから
 * 指定案件の変更履歴を新しい順で返す
 ****************************************************/
function getCaseChangeLogs_(caseId) {
  const safeCaseId = String(caseId || '').trim();

  if (!safeCaseId) {
    throw new Error('case_id が指定されていません。');
  }

  const rows = getSheetObjects_(SHEET_CASE_CHANGE_LOGS);

  return rows
    .filter(function(row) {
      return String(row.case_id || '') === safeCaseId;
    })
    .sort(function(a, b) {
      return String(b.changed_at || '').localeCompare(String(a.changed_at || ''));
    });
}
/****************************************************
 * getCaseChangeLogs_ ここまで
 ****************************************************/