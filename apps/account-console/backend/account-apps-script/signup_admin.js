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

    if (!normalizeText(approval.organizationId)) {
      return { success: false, message: "organization_id は必須です" };
    }

    const allowedModules = Array.isArray(approval.allowedModules)
      ? approval.allowedModules.filter(function(v) { return normalizeText(v) !== ""; })
      : [];

    if (allowedModules.length === 0) {
      return { success: false, message: "allowed_modules は必須です" };
    }

    if (!normalizeText(approval.status)) {
      return { success: false, message: "status は必須です" };
    }

    if (!normalizeText(approval.workStatus)) {
      return { success: false, message: "work_status は必須です" };
    }

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