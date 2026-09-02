// ===== 文字列正規化ここから =====
function normalizeShiftCoreText(value) {
  return String(value == null ? "" : value)
    .replace(/\u3000/g, " ")
    .trim();
}
// ===== 文字列正規化ここまで =====


// ===== 共通JSON返却ここから =====
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
// ===== 共通JSON返却ここまで =====

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

// ===== スプレッドシート文字列無害化ここから =====
function escapeAccountSpreadsheetValue_(value) {
  if (value == null) return "";
  if (typeof value !== "string") return value;
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value;
}
// ===== スプレッドシート文字列無害化ここまで =====

// ===== 現在時刻ISO文字列 JST ここから =====
function getNowIsoStringJst() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss");
}
// ===== 現在時刻ISO文字列 JST ここまで =====
