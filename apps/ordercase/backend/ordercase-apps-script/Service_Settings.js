/****************************************************
 * Service_Settings.gs
 * settings の処理
 ****************************************************/

function getSettingsMap_() {
  const rows = getSheetObjects_(SHEET_SETTINGS);
  const map = {};

  rows.forEach(function(row) {
    if (row.key) {
      map[row.key] = row.value || '';
    }
  });

  return map;
}