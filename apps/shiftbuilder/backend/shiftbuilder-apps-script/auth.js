// ===== ShiftBuilder Auth ここから =====


// ===== IDトークン検証設定ここから =====
const FIREBASE_WEB_API_KEY = "AIzaSyAXDhMT1IP1xQ9f0WiOIjmmfBHoQDWZ0dI";
// ===== IDトークン検証設定ここまで =====


// ===== IDトークンからメール解決ここから =====
function resolveFirebaseEmailByIdToken_(idToken) {
  const token = normalizeText(idToken);

  if (!token) {
    return {
      ok: false,
      success: false,
      code: "ID_TOKEN_REQUIRED",
      message: "idToken が必要です"
    };
  }

  const url =
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
    encodeURIComponent(FIREBASE_WEB_API_KEY);

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      idToken: token
    })
  });

  const statusCode = response.getResponseCode();
  const text = response.getContentText();

  let data = {};
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      success: false,
      code: "INVALID_LOOKUP_RESPONSE",
      message: "トークン検証レスポンスの解析に失敗しました"
    };
  }

  if (statusCode !== 200) {
    return {
      ok: false,
      success: false,
      code: data && data.error && data.error.message
        ? data.error.message
        : "TOKEN_LOOKUP_FAILED",
      message: "IDトークンの検証に失敗しました"
    };
  }

  const users = Array.isArray(data.users) ? data.users : [];
  const email = normalizeText(users[0] && users[0].email);

  if (!email) {
    return {
      ok: false,
      success: false,
      code: "EMAIL_NOT_FOUND",
      message: "IDトークンからメールアドレスを取得できませんでした"
    };
  }

  return {
    ok: true,
    success: true,
    email: email
  };
}
// ===== IDトークンからメール解決ここまで =====


// ===== IDトークンから currentUser 解決ここから =====
function resolveCurrentUserByIdToken(idToken) {
  const tokenResult = resolveFirebaseEmailByIdToken_(idToken);

  if (!tokenResult.ok) {
    return tokenResult;
  }

  const user = findUserByEmail_(tokenResult.email);

  if (!user) {
    return {
      ok: false,
      success: false,
      code: "USER_NOT_FOUND",
      message: "ログイン中のメールアドレスに一致するアカウントが見つかりません"
    };
  }

  return {
    ok: true,
    success: true,
    user: user
  };
}
// ===== IDトークンから currentUser 解決ここまで =====


// ===== ShiftBuilder Auth ここまで =====