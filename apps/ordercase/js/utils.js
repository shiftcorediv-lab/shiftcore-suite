/****************************************************
 * utils.js
 * OrderCase 共通ユーティリティ
 ****************************************************/


/****************************************************
 * escapeHtml ここから
 ****************************************************/
function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
/****************************************************
 * escapeHtml ここまで
 ****************************************************/


/****************************************************
 * getQueryParam ここから
 ****************************************************/
function getQueryParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}
/****************************************************
 * getQueryParam ここまで
 ****************************************************/


/****************************************************
 * todayString ここから
 ****************************************************/
function todayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
/****************************************************
 * todayString ここまで
 ****************************************************/


/****************************************************
 * displayValue ここから
 ****************************************************/
function displayValue(value) {
  if (value === '' || value === null || value === undefined) {
    return '-';
  }

  return value;
}
/****************************************************
 * displayValue ここまで
 ****************************************************/


/****************************************************
 * formatBoolean ここから
 ****************************************************/
function formatBoolean(value) {
  if (value === true || String(value).toUpperCase() === 'TRUE') {
    return 'はい';
  }

  if (value === false || String(value).toUpperCase() === 'FALSE') {
    return 'いいえ';
  }

  return '-';
}
/****************************************************
 * formatBoolean ここまで
 ****************************************************/


/****************************************************
 * formatAmount ここから
 ****************************************************/
function formatAmount(value) {
  if (value === '' || value === null || value === undefined) {
    return '-';
  }

  const num = Number(value);

  if (Number.isNaN(num)) {
    return value;
  }

  return `${num.toLocaleString()}円`;
}
/****************************************************
 * formatAmount ここまで
 ****************************************************/


/****************************************************
 * 表示名変換 ここから
 ****************************************************/
function getCaseTypeName(value, caseTypes) {
  if (Array.isArray(caseTypes)) {
    const found = caseTypes.find(function(type) {
      return type.case_type_id === value;
    });

    if (found) {
      return found.case_type_name;
    }
  }

  const map = {
    retail_store: '店頭稼働',
    event_sales: '出張販売',
    roadside: '軒先稼働',
    event_support: 'イベント応援',
    other: 'その他'
  };

  return map[value] || value || '-';
}

function getStatusName(value) {
  const map = {
    received: '受付済み',
    checking: '確認中',
    confirmed: '確定',
    cancelled: 'キャンセル',
    archived: 'アーカイブ'
  };

  return map[value] || value || '-';
}

function getSkillName(value) {
  const map = {
    any: '指定なし',
    registration_only: '登録のみ',
    multi_complete: 'マルチ完結',
    leader: 'リーダー候補'
  };

  return map[value] || value || '-';
}

function getAmountTypeName(value) {
  const map = {
    per_day: '1日あたり',
    per_person_day: '1人日あたり',
    per_line_day: '1枠日あたり',
    per_case: '案件一式',
    monthly: '月額',
    other: 'その他'
  };

  return map[value] || value || '-';
}

function getTaxTypeName(value) {
  const map = {
    tax_included: '税込',
    tax_excluded: '税別',
    unknown: '不明'
  };

  return map[value] || value || '-';
}

function getAllocationStatusName(value) {
  const map = {
    unallocated: '未割当',
    partially_allocated: '一部割当済み',
    allocated: '割当済み'
  };

  return map[value] || value || '-';
}
/****************************************************
 * 表示名変換 ここまで
 ****************************************************/


/****************************************************
 * getScheduleText ここから
 ****************************************************/
function getScheduleText(item) {
  if (item.input_mode === 'days') {
    return item.requested_days
      ? `${item.requested_days}日分`
      : '-';
  }

  if (item.input_mode === 'dates') {
    const dates = Array.isArray(item.case_dates) ? item.case_dates : [];

    if (dates.length === 0) {
      return '-';
    }

    return dates
      .map(function(date) {
        const people = date.required_people ? ` / ${date.required_people}人` : '';
        return `${date.work_date}${people}`;
      })
      .join('、');
  }

  return '-';
}
/****************************************************
 * getScheduleText ここまで
 ****************************************************/
