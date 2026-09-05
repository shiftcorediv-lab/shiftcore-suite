/****************************************************
 * Service_Bootstrap.gs
 * UI初期表示用データ取得
 ****************************************************/


/****************************************************
 * getBootstrapData_ ここから
 * OrderCase画面の初期表示に必要なデータを返す
 ****************************************************/
function getBootstrapData_() {
  return {
    case_types: getActiveCaseTypes_(),
    agencies_master: getActiveAgenciesMaster_(),
    stores_master: getActiveStoresMaster_(),
    settings: getSettingsMap_()
  };
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
