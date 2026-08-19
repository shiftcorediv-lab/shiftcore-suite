// =========================
// UrlFetch 承認テストここから
// =========================
function testFetchRosterAuthorization() {
  const roster = fetchRosterFromShiftCore_();
  Logger.log(JSON.stringify(roster, null, 2));
}
// =========================
// UrlFetch 承認テストここまで
// =========================

function testDrivePermission() {
  const ss = SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const file = DriveApp.getFileById(ss.getId());
  Logger.log(file.getName());
}