/****************************************************
 * Service_Bootstrap.gs
 * UI初期表示用データ取得
 ****************************************************/


/****************************************************
 * getBootstrapData_ ここから
 * OrderCase画面の初期表示に必要なデータを返す
 ****************************************************/
function getBootstrapData_() {
  return cachedOrderReference_('bootstrap', function() { return {
    supports_person_conditions: true,
    case_types: getActiveCaseTypes_(),
    agencies_master: getActiveAgenciesMaster_(),
    stores_master: getActiveStoresMaster_(),
    settings: getSettingsMap_()
  }; });
}

// 個人・権限情報を含まない参照結果だけを保存。API入口の権限確認後に呼ぶ。
function cachedOrderReference_(name, loader, diagnostic) {
  let cache, key;
  if (diagnostic) diagnostic.cache = 'miss';
  try {
    const version = PropertiesService.getScriptProperties().getProperty('ORDER_REFERENCE_VERSION') || '0';
    key = 'order-reference:' + version + ':' + name;
    cache = CacheService.getScriptCache();
    const value = cache.get(key);
    if (value) {
      const parsed = JSON.parse(value);
      if (diagnostic) diagnostic.cache = 'hit';
      return parsed;
    }
  } catch (_) { cache = null; if (diagnostic) diagnostic.cache = 'unavailable'; }
  const result = loader();
  if (cache) { try { cache.put(key, JSON.stringify(result), 1800); } catch (_) {} }
  return result;
}

function invalidateOrderReferences_() {
  // 古い取得が遅れて完了しても、新しい世代へ書き戻せない。
  PropertiesService.getScriptProperties().setProperty('ORDER_REFERENCE_VERSION', Utilities.getUuid());
}
/****************************************************
 * getBootstrapData_ ここまで
 ****************************************************/


/****************************************************
 * getActiveCaseTypes_ ここから
 * active=TRUE の案件種別を sort_order 順で返す
 ****************************************************/
function getActiveCaseTypes_() {
  const rows = getSheetObjects_(SHEET_CASE_TYPES);

  return rows
    .filter(function(row) {
      return String(row.active).toUpperCase() === 'TRUE';
    })
    .sort(function(a, b) {
      return toNumber_(a.sort_order, 999) - toNumber_(b.sort_order, 999);
    });
}
/****************************************************
 * getActiveCaseTypes_ ここまで
 ****************************************************/
