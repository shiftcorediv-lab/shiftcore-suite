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

  if (typeof pmoReadOnlyRequest_ !== "undefined" && pmoReadOnlyRequest_) {
    if (!sheet) throw new Error("希望休申請シートが未設定です。管理者へ連絡してください。");
    // 参照で列修復や固定行の更新を行わない。保存側の初期化は従来どおり。
    const headers = sheet.getRange(1, 1, 1, SETTINGS.REQUEST_HEADER.length).getDisplayValues()[0];
    if (SETTINGS.REQUEST_HEADER.some((value, index) => normalizeText(headers[index]) !== value)) throw new Error("希望休申請シートの列構成を確認してください。");
    return sheet;
  }

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
