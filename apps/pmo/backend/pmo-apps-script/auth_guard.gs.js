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

  // 本人照合だけを最大2回。希望休の保存・反映処理そのものは再送しない。
  for (let attempt = 0; attempt < 2; attempt++) {
    let status = 0, data = null;
    try {
      const response = UrlFetchApp.fetch(SETTINGS.SHIFTCORE_LOGIN_API_URL, {
        method: "post",
        contentType: "text/plain;charset=utf-8",
        muteHttpExceptions: true,
        payload: JSON.stringify({ action: "resolveCurrentUserByIdToken", idToken: token })
      });
      status = response.getResponseCode();
      data = JSON.parse(response.getContentText());
    } catch (_) { /* 通信例外やHTML応答の本文・トークンはログに残さない。 */ }
    const valid = data && typeof data === "object" && !Array.isArray(data) && typeof data.ok === "boolean";
    const temporaryCode = valid && ["WORKER_ERROR", "INVALID_LOOKUP_RESPONSE", "AUTH_SERVICE_UNAVAILABLE"].includes(data.code);
    // 停止・期限切れ・権限拒否などの正常な拒否応答はそのまま返す。
    if (valid && !data.ok && !temporaryCode) return data;
    if (status === 200 && valid && data.ok && data.user) return data;
    if (status === 401 || status === 403 || (status >= 400 && status < 500 && ![404, 408, 429].includes(status))) {
      return { ok:false, code:"AUTH_REQUEST_FAILED", message:"本人確認が拒否されました。ダッシュボードから開き直してください。" };
    }
  }
  return {
    ok:false,
    code:"AUTH_SERVICE_UNAVAILABLE",
    message:"本人確認サービスとの通信に失敗しました。希望休は送信していません。少し待ってから画面を再読み込みしてください。"
  };
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
