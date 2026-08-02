// =========================
// ShiftCore currentUser 解決ここから
// =========================
function resolveShiftCoreCurrentUserByIdToken_(idToken) {
  const token = normalizeText(idToken);

  if (!token) {
    return {
      ok: false,
      code: "ID_TOKEN_REQUIRED",
      message: "idToken が必要です"
    };
  }

  const response = UrlFetchApp.fetch(SETTINGS.SHIFTCORE_LOGIN_API_URL, {
    method: "post",
    contentType: "text/plain;charset=utf-8",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      action: "resolveCurrentUserByIdToken",
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
      code: "INVALID_AUTH_RESPONSE",
      message: "認証レスポンスの解析に失敗しました"
    };
  }

  if (statusCode !== 200) {
    return {
      ok: false,
      code: data?.code || "AUTH_REQUEST_FAILED",
      message: data?.message || "認証確認に失敗しました"
    };
  }

  return data;
}
// =========================
// ShiftCore currentUser 解決ここまで
// =========================


// =========================
// PMO管理権限確認ここから
// =========================
function requirePmoAdminUser_(idToken) {
  const authResult = resolveShiftCoreCurrentUserByIdToken_(idToken);

  if (!authResult.ok) {
    return {
      success: false,
      message: authResult.message || "認証確認に失敗しました"
    };
  }

  const user = authResult.user || {};
  const role = normalizeText(user.role).toLowerCase();

  if (role !== "admin" && role !== "developer") {
    return {
      success: false,
      message: "このアカウントには管理権限がありません"
    };
  }

  return {
    success: true,
    user: {
      userId: normalizeText(user.internal_user_id || user.userId),
      displayName: normalizeText(user.name || user.displayName),
      employeeCode: normalizeText(user.employee_code || user.employeeCode).toUpperCase(),
      role: role,
      workStatus: normalizeText(user.work_status || user.workStatus).toLowerCase(),
      email: normalizeText(user.email)
    }
  };
}
// =========================
// PMO管理権限確認ここまで
// =========================