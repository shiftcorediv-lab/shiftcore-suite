// ===== signup承認の操作者確認ここから =====
const SIGNUP_ADMIN_ALLOWED_ROLES_SERVER = ["admin", "dev", "developer"];

function requireSignupAdminOperator_(body) {
  const idToken = normalizeText(body.idToken);

  if (!idToken) {
    return { success: false, message: "ログイン情報がありません" };
  }

  const resolved = resolveCurrentUserByIdToken(idToken);

  if (!resolved || resolved.ok !== true || !resolved.user) {
    return { success: false, message: "ログインユーザーを確認できません" };
  }

  const user = resolved.user;

  // status=active は checkLoginUserByEmail が既に強制している。
  // ここでの再確認は多層防御であり、新規の制限ではない。
  if (normalizeText(user.status).toLowerCase() !== "active") {
    return { success: false, message: "このユーザーは停止中です" };
  }

  const role = normalizeText(user.role).toLowerCase();
  const modules = Array.isArray(user.allowed_modules)
    ? user.allowed_modules
    : parseAllowedModules(user.allowed_modules);

  const allowedByRole = SIGNUP_ADMIN_ALLOWED_ROLES_SERVER.indexOf(role) !== -1;
  const allowedByModule = modules.indexOf(ACCOUNT_CONSOLE_MODULE_KEY) !== -1;

  if (!allowedByRole && !allowedByModule) {
    return { success: false, message: "登録申請管理の利用権限がありません" };
  }

  const operatorId = normalizeText(user.internal_user_id);

  if (!operatorId) {
    return { success: false, message: "操作者IDを確認できません" };
  }

  return { success: true, user: user, operatorId: operatorId };
}
// ===== signup承認の操作者確認ここまで =====


// ===== 登録申請一覧取得ここから =====
function getSignupRequests(status) {
  try {
    ensureSignupRequestsHeader_();

    const sheet = getSignupRequestsSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return {
        success: true,
        requests: []
      };
    }

    const headerMap = getHeaderMap_(sheet);
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();

    let requests = values.map(function(row) {
      return {
        request_id: row[(headerMap["request_id"] || 1) - 1] || "",
        submitted_at: row[(headerMap["submitted_at"] || 1) - 1] || "",
        applicant_email: row[(headerMap["applicant_email"] || 1) - 1] || "",
        applicant_name: row[(headerMap["applicant_name"] || 1) - 1] || "",
        applicant_type: row[(headerMap["applicant_type"] || 1) - 1] || "",
        company_name: row[(headerMap["company_name"] || 1) - 1] || "",
        phone: row[(headerMap["phone"] || 1) - 1] || "",
        note: row[(headerMap["note"] || 1) - 1] || "",
        request_status: row[(headerMap["request_status"] || 1) - 1] || ""
      };
    });

    if (status) {
      requests = requests.filter(function(request) {
        return normalizeText(request.request_status) === normalizeText(status);
      });
    }

    requests.sort(function(a, b) {
      return a.submitted_at < b.submitted_at ? 1 : -1;
    });

    return {
      success: true,
      requests: requests
    };

  } catch (error) {
    return {
      success: false,
      message: "申請一覧取得中にエラーが発生しました: " + error.message
    };
  }
}
// ===== 登録申請一覧取得ここまで =====


// ===== 承認処理ここから =====
function approveSignupRequest(requestId, approval, reviewedBy) {
  try {
    const request = getSignupRequestById_(requestId);

    if (!request) {
      return {
        success: false,
        message: "対象の申請が見つかりません"
      };
    }

    if (normalizeText(request.request_status) !== "pending_approval") {
      return {
        success: false,
        message: "承認対象ではない申請です"
      };
    }

    if (!normalizeText(approval.role)) {
      return { success: false, message: "role は必須です" };
    }

    const role = normalizeText(approval.role);

    if (VALID_ACCOUNT_ROLES.indexOf(role) === -1) {
      return { success: false, message: "role の値が不正です" };
    }

    if (!normalizeText(approval.organizationId)) {
      return { success: false, message: "organization_id は必須です" };
    }

    const allowedModules = Array.isArray(approval.allowedModules)
      ? approval.allowedModules.filter(function(v) { return normalizeText(v) !== ""; })
      : [];

    if (allowedModules.length === 0) {
      return { success: false, message: "allowed_modules は必須です" };
    }

    // allowed_modules の許容値リストは未定義。仕様確定後に追加する。

    if (!normalizeText(approval.status)) {
      return { success: false, message: "status は必須です" };
    }

    const status = normalizeText(approval.status);

    if (VALID_ACCOUNT_STATUSES.indexOf(status) === -1) {
      return { success: false, message: "status の値が不正です" };
    }

    if (!normalizeText(approval.workStatus)) {
      return { success: false, message: "work_status は必須です" };
    }

    // approval.workStatus はクライアントから受け取るが、
    // 現行仕様では常に "on" を設定している。仕様確定後に見直す。

    if (existsUserByEmail_(request.applicant_email)) {
      return {
        success: false,
        message: "このメールアドレスはすでに登録済みです"
      };
    }

    const internalUserId = appendUserMasterFromSignup_(request, approval);

    const sheet = getSignupRequestsSheet();
    const headerMap = getHeaderMap_(sheet);
    const row = request.row;
    const reviewedAt = getNowIsoStringJst();

    sheet.getRange(row, headerMap["request_status"]).setValue("approved");
    sheet.getRange(row, headerMap["reviewed_at"]).setValue(reviewedAt);
    sheet.getRange(row, headerMap["reviewed_by"]).setValue(normalizeText(reviewedBy));
    sheet.getRange(row, headerMap["linked_internal_user_id"]).setValue(internalUserId);

    sendSignupApprovedMail_(request.applicant_email, request.applicant_name);

    return {
      success: true,
      message: "承認しました",
      internalUserId: internalUserId
    };

  } catch (error) {
    return {
      success: false,
      message: "承認処理中にエラーが発生しました: " + error.message
    };
  }
}
// ===== 承認処理ここまで =====


// ===== 却下処理ここから =====
function rejectSignupRequest(requestId, reviewedBy) {
  try {
    const request = getSignupRequestById_(requestId);

    if (!request) {
      return {
        success: false,
        message: "対象の申請が見つかりません"
      };
    }

    if (normalizeText(request.request_status) !== "pending_approval") {
      return {
        success: false,
        message: "却下対象ではない申請です"
      };
    }

    const sheet = getSignupRequestsSheet();
    const headerMap = getHeaderMap_(sheet);
    const row = request.row;

    sheet.getRange(row, headerMap["request_status"]).setValue("rejected");
    sheet.getRange(row, headerMap["reviewed_at"]).setValue(getNowIsoStringJst());
    sheet.getRange(row, headerMap["reviewed_by"]).setValue(normalizeText(reviewedBy));

    return {
      success: true,
      message: "却下しました"
    };

  } catch (error) {
    return {
      success: false,
      message: "却下処理中にエラーが発生しました: " + error.message
    };
  }
}
// ===== 却下処理ここまで =====
