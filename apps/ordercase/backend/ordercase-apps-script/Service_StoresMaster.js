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
  const agencyName = String(payload.agency_name || '').trim();
  const storeName = String(payload.store_name || '').trim();
  const storeArea = String(payload.store_area || '').trim();

  const existing = findStoreMasterByNames_(agencyName, storeName);

  if (existing) {
    return existing;
  }

  const now = new Date();

  const agencyId = payload.agency_id || generateAgencyId_();
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
function findStoreMasterByNames_(agencyName, storeName) {
  const rows = getSheetObjects_(SHEET_STORES_MASTER);

  const normalizedAgencyName = normalizeMasterName_(agencyName);
  const normalizedStoreName = normalizeMasterName_(storeName);

  const found = rows.find(function(row) {
    const rowAgencyName = normalizeMasterName_(row.agency_name);
    const rowStoreName = normalizeMasterName_(row.store_name);

    return rowAgencyName === normalizedAgencyName &&
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

function ensureStoreMasterLocationColumns_() {
  const sheet = getSheetForUpdate_(SHEET_STORES_MASTER);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  let nextColumn = lastColumn + 1;
  ['store_short_name', 'address', 'nearest_station'].forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, nextColumn).setValue(header);
      nextColumn += 1;
    }
  });
}

function updateStoreMaster_(payload) {
  ensureStoreMasterLocationColumns_();
  const storeId = String(payload.store_id || '').trim();
  if (!storeId) throw new Error('店舗IDが必要です。');
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
    agency_name: String(payload.agency_name || '').trim(),
    store_name: String(payload.store_name || '').trim(),
    store_short_name: String(payload.store_short_name || '').trim(),
    store_area: String(payload.store_area || '').trim(),
    address: String(payload.address || '').trim(),
    nearest_station: String(payload.nearest_station || '').trim(),
    updated_at: new Date()
  };
  if (!record.agency_name || !record.store_name) throw new Error('代理店名と店舗名は必須です。');
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
 * generateAgencyId_ ここから
 * 代理店IDを発行する
 ****************************************************/
function generateAgencyId_() {
  const rows = getSheetObjects_(SHEET_STORES_MASTER);
  const count = rows.filter(function(row) {
    return row.agency_id;
  }).length;

  return 'AG-' + String(count + 1).padStart(4, '0');
}
/****************************************************
 * generateAgencyId_ ここまで
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
