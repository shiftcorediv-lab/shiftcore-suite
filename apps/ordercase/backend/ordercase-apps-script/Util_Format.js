/****************************************************
 * Util_Format.gs
 * 数値・日付・文字列変換
 ****************************************************/

function toNumber_(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const num = Number(value);

  if (isNaN(num)) {
    return defaultValue;
  }

  return num;
}

function splitEmails_(text) {
  if (!text) {
    return [];
  }

  return String(text)
    .split(',')
    .map(function(email) {
      return email.trim();
    })
    .filter(function(email) {
      return email;
    });
}

function formatDate_(date, pattern) {
  return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), pattern);
}