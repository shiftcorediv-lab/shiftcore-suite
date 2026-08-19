// =========================
// 文字列正規化ここから
// =========================
function normalizeText(value) {
  return String(value == null ? "" : value)
    .replace(/\u3000/g, " ")
    .trim();
}
// =========================
// 文字列正規化ここまで
// =========================


// =========================
// 現在日時取得ここから
// =========================
function getNowIsoStringJst() {
  return Utilities.formatDate(
    new Date(),
    SETTINGS.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  );
}

function getNowCompactTimestamp() {
  return Utilities.formatDate(
    new Date(),
    SETTINGS.TIMEZONE,
    "yyyyMMddHHmmss"
  );
}
// =========================
// 現在日時取得ここまで
// =========================


// =========================
// 年月チェックここから
// YYYY-MM
// =========================
function isValidYearMonth(yearMonth) {
  return /^\d{4}-\d{2}$/.test(normalizeText(yearMonth));
}
// =========================
// 年月チェックここまで
// =========================


// =========================
// 日付配列チェックここから
// YYYY-MM-DD[]
// =========================
function isValidDateArray(offDates, targetYearMonth) {
  if (!Array.isArray(offDates)) {
    return false;
  }

  const ym = normalizeText(targetYearMonth);

  for (let i = 0; i < offDates.length; i++) {
    const dateStr = normalizeText(offDates[i]);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return false;
    }

    if (!dateStr.startsWith(ym + "-")) {
      return false;
    }
  }

  return true;
}
// =========================
// 日付配列チェックここまで
// =========================


// =========================
// 月末日取得ここから
// yearMonth: YYYY-MM
// =========================
function getLastDayOfMonth(yearMonth) {
  const normalized = normalizeText(yearMonth);
  const parts = normalized.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);

  if (!year || !month) {
    throw new Error("対象年月が不正です: " + yearMonth);
  }

  return new Date(year, month, 0).getDate();
}
// =========================
// 月末日取得ここまで
// =========================