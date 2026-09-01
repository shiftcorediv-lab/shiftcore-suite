// ===== signup承認の操作者確認ここから =====
const SIGNUP_ADMIN_ALLOWED_ROLES_SERVER = ["admin", "developer"];

function requireSignupRequestViewer_(body) {
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

function isSignupRequestEditor_(user) {
  const role = normalizeText(user && user.role).toLowerCase();
  return SIGNUP_ADMIN_ALLOWED_ROLES_SERVER.indexOf(role) !== -1;
}

function requireSignupAdminOperator_(body) {
  const operator = requireSignupRequestViewer_(body);

  if (!operator.success) {
    return operator;
  }

  if (!isSignupRequestEditor_(operator.user)) {
    return {
      success: false,
      code: "SIGNUP_REVIEW_WRITE_FORBIDDEN",
      message: "登録申請の承認・却下は管理者だけが操作できます"
    };
  }

  return operator;
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
function approveSignupRequest(requestId, approval, reviewedBy, operator) {
  try {
    if (!normalizeText(approval.role)) {
      return { success: false, message: "role は必須です" };
    }

    const role = normalizeText(approval.role);

    if (VALID_ACCOUNT_ROLES.indexOf(role) === -1) {
      return { success: false, message: "role の値が不正です" };
    }

    // developer の新設は Account Console と同じ共通ガードへ委譲する。
    // 承認経路を素通りさせると、非developerが自分で申請して自分で承認する
    // 自己昇格経路になるため、ここを塞がないと developer 全権化が権限昇格機能になる。
    assertDeveloperAccountMutationAllowed_(operator, "", role, "");

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

    const workStatus = normalizeText(approval.workStatus).toLowerCase();
    if (["on", "off"].indexOf(workStatus) === -1) {
      return { success: false, message: "work_status の値が不正です" };
    }
    approval.workStatus = workStatus;

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error("SIGNUP_REVIEW_LOCK_TIMEOUT");
    }

    let approvedRequest;
    let internalUserId;
    let repaired = false;

    try {
      const request = getSignupRequestById_(requestId);

      if (!request) {
        return {
          success: false,
          message: "対象の申請が見つかりません"
        };
      }

      const requestStatus = normalizeText(request.request_status);
      const linkedUserId = normalizeText(request.linked_internal_user_id);
      const userCreatedForRequest = findUserBySignupRequestId_(request.request_id);

      if (requestStatus === "approved" && linkedUserId) {
        const linkedUser = getUsersData().find(function(user) {
          return normalizeText(user.internal_user_id) === linkedUserId;
        });

        if (!linkedUser ||
            normalizeText(linkedUser.email).toLowerCase() !==
              normalizeText(request.applicant_email).toLowerCase()) {
          return {
            success: false,
            message: "承認済み申請と紐づくユーザーが一致しません。管理者へ確認を依頼してください"
          };
        }

        return {
          success: true,
          message: "この申請はすでに承認済みです",
          internalUserId: linkedUserId,
          idempotentReplay: true
        };
      }

      if (requestStatus === "approved" && !userCreatedForRequest) {
        return {
          success: false,
          message: "承認済み申請のユーザー作成履歴を確認できません。管理者へ確認を依頼してください"
        };
      }

      if (requestStatus !== "pending_approval" && requestStatus !== "approved") {
        return {
          success: false,
          message: "承認対象ではない申請です"
        };
      }

      if (userCreatedForRequest) {
        const mismatch = getSignupCreatedUserMismatch_(
          userCreatedForRequest,
          request,
          approval
        );
        if (mismatch) {
          return {
            success: false,
            message: "作成済みユーザーと承認内容が一致しません（" + mismatch + "）。管理者へ確認を依頼してください"
          };
        }

        internalUserId = normalizeText(userCreatedForRequest.internal_user_id);
        const recoveryAuthorizationEventId = beginDeveloperAccountAuthorizationEvent_(
          operator,
          "",
          userCreatedForRequest.role,
          internalUserId,
          "登録申請承認の途中状態を復旧"
        );
        completeDeveloperAccountAuthorizationEvent_(
          recoveryAuthorizationEventId,
          operator,
          "",
          userCreatedForRequest.role,
          internalUserId,
          "登録申請承認の途中状態を復旧"
        );
        repaired = true;
      } else {
        if (existsUserByEmail_(request.applicant_email)) {
          return {
            success: false,
            message: "このメールアドレスはすでに登録済みです"
          };
        }

        internalUserId = appendUserMasterFromSignup_(request, approval, operator);
      }

      updateSignupRequestReviewState_(request, {
        request_status: "approved",
        reviewed_at: getNowIsoStringJst(),
        reviewed_by: normalizeText(reviewedBy),
        linked_internal_user_id: internalUserId
      });
      approvedRequest = request;
    } finally {
      lock.releaseLock();
    }

    let notificationSent = false;
    try {
      sendSignupApprovedMail_(approvedRequest.applicant_email, approvedRequest.applicant_name);
      notificationSent = true;
    } catch (notificationError) {
      notificationSent = false;
    }

    return {
      success: true,
      message: notificationSent
        ? "承認しました"
        : "承認しましたが、承認通知メールは送信できませんでした",
      internalUserId: internalUserId,
      repaired: repaired,
      notificationSent: notificationSent
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
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error("SIGNUP_REVIEW_LOCK_TIMEOUT");
    }

    try {
      const request = getSignupRequestById_(requestId);

      if (!request) {
        return {
          success: false,
          message: "対象の申請が見つかりません"
        };
      }

      if (normalizeText(request.request_status) === "rejected") {
        return {
          success: true,
          message: "この申請はすでに却下済みです",
          idempotentReplay: true
        };
      }

      if (normalizeText(request.request_status) !== "pending_approval") {
        return {
          success: false,
          message: "却下対象ではない申請です"
        };
      }

      updateSignupRequestReviewState_(request, {
        request_status: "rejected",
        reviewed_at: getNowIsoStringJst(),
        reviewed_by: normalizeText(reviewedBy),
        linked_internal_user_id: ""
      });

      return {
        success: true,
        message: "却下しました"
      };
    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    return {
      success: false,
      message: "却下処理中にエラーが発生しました: " + error.message
    };
  }
}
// ===== 却下処理ここまで =====

function updateSignupRequestReviewState_(request, changes) {
  const sheet = getSignupRequestsSheet();
  const headerMap = getHeaderMap_(sheet);
  const lastColumn = sheet.getLastColumn();
  const rowValues = sheet.getRange(request.row, 1, 1, lastColumn).getValues()[0];
  const requiredHeaders = [
    "request_status",
    "reviewed_at",
    "reviewed_by",
    "linked_internal_user_id"
  ];

  requiredHeaders.forEach(function(header) {
    if (!headerMap[header]) {
      throw new Error("登録申請シートの必須列がありません: " + header);
    }
    rowValues[headerMap[header] - 1] = changes[header];
  });

  sheet.getRange(request.row, 1, 1, lastColumn).setValues([rowValues]);
}

function getSignupCreatedUserMismatch_(user, request, approval) {
  const comparisons = [
    ["email", normalizeText(user.email).toLowerCase(), normalizeText(request.applicant_email).toLowerCase()],
    ["role", normalizeText(user.role), normalizeText(approval.role)],
    ["organization_id", normalizeText(user.organization_id), normalizeText(approval.organizationId)],
    ["status", normalizeText(user.status), normalizeText(approval.status)],
    [
      "work_status",
      normalizeText(user.workStatus || user.work_status).toLowerCase(),
      normalizeText(approval.workStatus).toLowerCase()
    ],
    [
      "allowed_modules",
      normalizeSignupAllowedModulesForComparison_(user.allowed_modules),
      normalizeSignupAllowedModulesForComparison_(approval.allowedModules)
    ]
  ];

  for (let index = 0; index < comparisons.length; index++) {
    if (comparisons[index][1] !== comparisons[index][2]) {
      return comparisons[index][0];
    }
  }

  return "";
}

function normalizeSignupAllowedModulesForComparison_(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values
    .map(function(item) { return normalizeText(item).toLowerCase(); })
    .filter(function(item) { return item !== ""; })
    .sort()
    .join(",");
}
