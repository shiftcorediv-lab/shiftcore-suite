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