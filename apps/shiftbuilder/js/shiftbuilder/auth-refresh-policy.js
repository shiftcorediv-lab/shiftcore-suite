const AUTH_REFRESH_PATTERN = /タイムアウト|認証.*期限|token.*expired|id[_ ]?token.*expired/i;

export function requiresAuthRefresh(value) {
  return AUTH_REFRESH_PATTERN.test(String(value || ""));
}

export function buildAuthRefreshMessage(detail = "") {
  const instruction = "認証確認がタイムアウトしました。画面上部の「再読み込みして再接続」を押してください。";
  return detail ? `${instruction}\n${detail}` : instruction;
}
