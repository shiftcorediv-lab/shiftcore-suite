// =========================
// スプシ取得ここから
// =========================
function getSpreadsheet_() {
  return SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
}
// =========================
// スプシ取得ここまで
// =========================


// =========================
// 希望休申請シート取得ここから
// ヘッダーが無ければ作る
// =========================
function getOrCreateRequestSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SETTINGS.REQUEST_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS.REQUEST_SHEET_NAME);
  }

  ensureRequestSheetHeader(sheet);
  return sheet;
}

function ensureRequestSheetHeader(sheet) {
  const expected = SETTINGS.REQUEST_HEADER;
  const current = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];

  let matched = true;
  for (let i = 0; i < expected.length; i++) {
    if (normalizeText(current[i]) !== expected[i]) {
      matched = false;
      break;
    }
  }

  if (!matched) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  }

  sheet.setFrozenRows(1);
}
// =========================
// 希望休申請シート取得ここまで
// =========================