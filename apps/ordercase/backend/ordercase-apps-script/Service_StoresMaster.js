/****************************************************
 * Service_StoresMaster.gs
 * stores_master の処理
 ****************************************************/


/****************************************************
 * ensureStoreMaster_ ここから
 * 案件登録時に代理店・店舗マスターを確認する
 * 既存マスターがあれば既存IDを返し、なければ仮登録する
 ****************************************************/
function ensureStoreMaster_(payload, caseId) {
  ensureStoreMasterLocationColumns_();
  const agency = ensureAgencyMaster_(payload, caseId);
  const agencyId = String(agency.agency_id || '').trim();
  const agencyName = String(agency.agency_name || payload.agency_name || '').trim();
  const storeName = String(payload.store_name || '').trim();
  const storeArea = String(payload.store_area || '').trim();

  const existing = findStoreMasterByNames_(agencyId, agencyName, storeName);

  if (existing) {
    if (String(existing.status || 'active') === 'archived') {
      throw new Error('この店舗はアーカイブ済みです。店舗マスターで復元してください。');
    }
    return existing;
  }

  const now = new Date();

  const storeId = payload.store_id || generateStoreId_();

  const record = {
    agency_id: agencyId,
    agency_name: agencyName,
    store_id: storeId,
    store_name: storeName,
    store_area: storeArea,
    store_short_name: String(payload.store_short_name || '').trim(),
    address: String(payload.store_address || '').trim(),
    nearest_station: String(payload.store_nearest_station || '').trim(),
    preferred_member_ids: '',
    ng_member_ids: '',
    preferred_note: '',
    ng_note: '',

    status: 'active',
    provisional: 'TRUE',
    created_from_case_id: caseId,

    memo: '案件登録時に自動仮登録',
    created_at: now,
    updated_at: now
  };

  appendObjectRow_(SHEET_STORES_MASTER, record);

  return record;
}
/****************************************************
 * ensureStoreMaster_ ここまで
 ****************************************************/


/****************************************************
 * findStoreMasterByNames_ ここから
 * 代理店名・店舗名で既存マスターを探す
 * 表記ブレ防止のため、完全一致ではなく正規化一致で照合する
 ****************************************************/
function findStoreMasterByNames_(agencyId, agencyName, storeName) {
  const rows = getSheetObjects_(SHEET_STORES_MASTER);

  const normalizedAgencyId = String(agencyId || '').trim();
  const normalizedAgencyName = normalizeMasterName_(agencyName);
  const normalizedStoreName = normalizeMasterName_(storeName);

  const found = rows.find(function(row) {
    const rowAgencyId = String(row.agency_id || '').trim();
    const rowAgencyName = normalizeMasterName_(row.agency_name);
    const rowStoreName = normalizeMasterName_(row.store_name);
    const agencyMatches = normalizedAgencyId
      ? rowAgencyId === normalizedAgencyId || (!rowAgencyId && rowAgencyName === normalizedAgencyName)
      : rowAgencyName === normalizedAgencyName;

    return agencyMatches &&
           rowStoreName === normalizedStoreName;
  });

  return found || null;
}
/****************************************************
 * findStoreMasterByNames_ ここまで
 ****************************************************/


/****************************************************
 * getActiveStoresMaster_ ここから
 * 有効な代理店・店舗マスターだけ返す
 ****************************************************/
function getActiveStoresMaster_() {
  const rows = getSheetObjects_(SHEET_STORES_MASTER);

  return rows.filter(function(row) {
    return String(row.status || 'active') === 'active';
  });
}

function getStoresMasterForManagement_() {
  return getSheetObjects_(SHEET_STORES_MASTER);
}

function ensureStoreMasterLocationColumns_() {
  const sheet = getSheetForUpdate_(SHEET_STORES_MASTER);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  let nextColumn = lastColumn + 1;
  ['store_short_name', 'address', 'nearest_station', 'preferred_member_ids', 'ng_member_ids', 'preferred_note', 'ng_note'].forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, nextColumn).setValue(header);
      nextColumn += 1;
    }
  });

  // 店舗画面の正式な状態値は「有効」と「アーカイブ」の2種類だけにする。
  // 過去の入力規則には inactive が含まれているため、先頭のデータ行を
  // 確認して必要な場合だけ規則を補正する。
  const statusColumnIndex = headers.indexOf('status');
  if (statusColumnIndex === -1) return;

  const statusColumn = statusColumnIndex + 1;
  const existingRule = sheet.getRange(2, statusColumn).getDataValidation();
  const existingValues = existingRule && existingRule.getCriteriaValues
    ? existingRule.getCriteriaValues()[0] || []
    : [];
  const hasExpectedStatusValues = existingValues.length === 2 &&
    existingValues.some(function(value) { return String(value) === 'active'; }) &&
    existingValues.some(function(value) { return String(value) === 'archived'; });

  if (hasExpectedStatusValues) return;

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['active', 'archived'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, statusColumn, Math.max(sheet.getMaxRows() - 1, 1), 1)
    .setDataValidation(statusRule);
}

function normalizeStoreStatus_(value) {
  const status = String(value || 'active').trim();
  if (status === 'active' || status === 'archived') return status;
  throw new Error('店舗状態は「有効」または「アーカイブ」を指定してください。');
}

function normalizeStoreMemberIds_(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,、]+/);
  const seen = {};
  const normalized = [];

  source.forEach(function(item) {
    const memberId = String(item || '').trim();
    const key = memberId.toLowerCase();
    if (!memberId || seen[key]) return;
    if (memberId.length > 100 || !/^[A-Za-z0-9@._+-]+$/.test(memberId)) {
      throw new Error('指名・NGにはメンバー内部IDまたはアカウントコードを指定してください。');
    }
    seen[key] = true;
    normalized.push(memberId);
  });

  if (normalized.length > 100) {
    throw new Error('指名・NGは各100名まで指定できます。');
  }

  return normalized.join(',');
}

function updateStoreMaster_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return updateStoreMasterWithoutLock_(payload);
  } finally {
    lock.releaseLock();
  }
}

function updateStoreMasterWithoutLock_(payload) {
  ensureStoreMasterLocationColumns_();
  const storeId = String(payload.store_id || '').trim();
  if (!storeId) throw new Error('店舗IDが必要です。');
  const agency = ensureAgencyMaster_(payload, '');
  const preferredMemberIds = normalizeStoreMemberIds_(payload.preferred_member_ids);
  const ngMemberIds = normalizeStoreMemberIds_(payload.ng_member_ids);
  const ngMemberIdKeys = ngMemberIds.split(',').map(function(value) {
    return value.toLowerCase();
  }).filter(Boolean);
  const duplicatedMemberId = preferredMemberIds.split(',').find(function(value) {
    return ngMemberIdKeys.indexOf(value.toLowerCase()) !== -1;
  });
  if (duplicatedMemberId) {
    throw new Error('同じメンバーを指名とNGの両方には登録できません: ' + duplicatedMemberId);
  }
  const sheet = getSheetForUpdate_(SHEET_STORES_MASTER);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) { return String(value || '').trim(); });
  const storeIdIndex = headers.indexOf('store_id');
  let targetIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][storeIdIndex] || '') === storeId) { targetIndex = i; break; }
  }
  if (targetIndex < 1) throw new Error('店舗が見つかりません: ' + storeId);
  const record = {
    agency_id: String(agency.agency_id || '').trim(),
    agency_name: String(agency.agency_name || '').trim(),
    store_name: String(payload.store_name || '').trim(),
    store_short_name: String(payload.store_short_name || '').trim(),
    store_area: String(payload.store_area || '').trim(),
    address: String(payload.address || '').trim(),
    nearest_station: String(payload.nearest_station || '').trim(),
    preferred_member_ids: preferredMemberIds,
    ng_member_ids: ngMemberIds,
    preferred_note: String(payload.preferred_note || '').trim(),
    ng_note: String(payload.ng_note || '').trim(),
    status: normalizeStoreStatus_(payload.status),
    updated_at: new Date()
  };
  if (!record.agency_id || !record.agency_name || !record.store_name) throw new Error('代理店と店舗名は必須です。');
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(record, header)) values[targetIndex][index] = record[header];
  });
  sheet.getRange(targetIndex + 1, 1, 1, headers.length).setValues([values[targetIndex]]);
  return Object.assign({ store_id: storeId }, record);
}
/****************************************************
 * getActiveStoresMaster_ ここまで
 ****************************************************/


/****************************************************
 * generateStoreId_ ここから
 * 店舗IDを発行する
 ****************************************************/
function generateStoreId_() {
  const rows = getSheetObjects_(SHEET_STORES_MASTER);
  const count = rows.filter(function(row) {
    return row.store_id;
  }).length;

  return 'ST-' + String(count + 1).padStart(4, '0');
}
/****************************************************
 * generateStoreId_ ここまで
 ****************************************************/


/****************************************************
 * normalizeMasterName_ ここから
 * マスター照合用に名称を正規化する
 *
 * 目的：
 * ・全角英数字と半角英数字の違いを吸収
 * ・前後スペースを無視
 * ・途中のスペース差を無視
 * ・大文字小文字の違いを無視
 *
 * 例：
 * ABC代理店
 * ＡＢＣ代理店
 * ABC 代理店
 * abc代理店
 * → 同じものとして扱う
 ****************************************************/
function normalizeMasterName_(value) {
  return String(value || '')
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}
/****************************************************
 * normalizeMasterName_ ここまで
 ****************************************************/
