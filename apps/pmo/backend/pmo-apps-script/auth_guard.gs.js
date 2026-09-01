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
// PMO本人確認ここから
// =========================
function requirePmoActiveUser_(idToken) {
  const authResult = resolveShiftCoreCurrentUserByIdToken_(idToken);

  if (!authResult.ok || !authResult.user) {
    return {
      success: false,
      code: authResult.code || "AUTH_INVALID",
      message: authResult.message || "ログインユーザーを確認できません"
    };
  }

  const source = authResult.user;
  const user = {
    userId: normalizeText(source.internal_user_id || source.userId),
    displayName: normalizeText(source.name || source.displayName),
    employeeCode: normalizeText(source.employee_code || source.employeeCode).toUpperCase(),
    role: normalizeText(source.role).toLowerCase(),
    status: normalizeText(source.status).toLowerCase(),
    workStatus: normalizeText(source.work_status || source.workStatus).toLowerCase()
  };

  if (user.status !== "active" || user.workStatus !== "on") {
    return {
      success: false,
      code: "PMO_USER_INACTIVE",
      message: "このアカウントは希望休の提出対象外です"
    };
  }

  if (!user.userId || !user.displayName || !user.employeeCode) {
    return {
      success: false,
      code: "PMO_USER_INVALID",
      message: "本人情報を確認できません"
    };
  }

  return {
    success: true,
    user: user
  };
}

function getPmoCurrentUserSecure(idToken) {
  const auth = requirePmoActiveUser_(idToken);

  if (!auth.success) {
    return auth;
  }

  return {
    success: true,
    user: auth.user
  };
}
// =========================
// PMO本人確認ここまで
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
