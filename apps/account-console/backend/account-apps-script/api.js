// ===== API入口ここから =====
function doGet(e) {
  try {
    const action = getAction_(e);

    if (action === "ping") {
      return jsonResponse_({
        success: true,
        message: "pong",
        environment: accountRuntimeEnvironment_(),
        timestamp: getNowIsoStringJst()
      });
    }

    return jsonResponse_({
      success: false,
      message: "Unknown GET action: " + action
    });

  } catch (error) {
    return jsonResponse_({
      success: false,
      message: "GET処理中にエラーが発生しました: " + error.message
    });
  }
}

function doPost(e) {
  try {
    const body = parseJsonBody_(e);
    const action = normalizeText(body.action || getAction_(e));

    // ===== ログイン照合 ここから =====
    // G-D: メール指定の照合は廃止。resolveCurrentUserByIdToken を使うこと。
    // 旧クライアント（キャッシュ済みの画面）向けに、更新を促す応答を返す。
    // この分岐は暫定である。撤去条件は C-10 を参照。
    if (action === "checkLoginUserByEmail") {
      return jsonResponse_({
        ok: false,
        code: "CLIENT_UPDATE_REQUIRED",
        message: "画面が古いため利用できません。ページを再読込してください。"
      });
    }
    // ===== ログイン照合 ここまで =====


    // ===== oauth ここから =====
    if (action === "resolveCurrentUserByIdToken") {
      const idToken = normalizeText(body.idToken);

      if (!idToken) {
        return jsonResponse_({
          ok: false,
          code: "ID_TOKEN_REQUIRED",
          message: "idToken が必要です"
        });
      }

      return jsonResponse_(resolveCurrentUserByIdToken(idToken));
    }

    if (action === "resolveAuthorizationContextByIdToken") {
      return jsonResponse_(resolveAuthorizationContextByIdToken_(body));
    }
    if (action === "attendanceApprovalContract") {
      return jsonResponse_(attendanceApprovalContract_(body));
    }
    if (action === "getPmoRosterSecure") {
      return jsonResponse_(getPmoRosterSecure(body.service_secret));
    }
    // ===== oauth ここまで =====


    // ===== Account Console系 POST ここから =====
    if (action === "accountConsoleGetCurrentUser") {
      return jsonResponse_(accountConsoleGetCurrentUser(body));
    }

    if (action === "accountConsoleGetBootstrap") {
      return jsonResponse_(accountConsoleGetBootstrap(body));
    }

    if (action === "accountConsoleListUsers") {
      return jsonResponse_(accountConsoleListUsers(body));
    }

    if (action === "accountConsoleCreateUser") {
      return jsonResponse_(accountConsoleCreateUser(body));
    }

    if (action === "accountConsoleUpdateUser") {
      return jsonResponse_(accountConsoleUpdateUser(body));
    }

    if (action === "accountConsoleUpdateOrganizationAssignment") {
      return jsonResponse_(accountConsoleUpdateOrganizationAssignment(body));
    }

    if (action === "accountConsoleBulkUpdateExecutives") {
      return jsonResponse_(accountConsoleBulkUpdateExecutives(body));
    }

    if (action === "accountConsoleGetOrganizationAssignment") {
      return jsonResponse_(accountConsoleGetOrganizationAssignment(body));
    }

    if (action === "accountConsoleGetLogs") {
      return jsonResponse_(accountConsoleGetLogs(body));
    }
    // ===== Account Console系 POST ここまで =====


    // ===== signup系 POST ここから =====
    if (action === "submitSignupRequest") {
      return jsonResponse_(submitSignupRequest(body.payload || body));
    }

    if (action === "getSignupRequestsSecure") {
      const operator = requireSignupRequestViewer_(body);

      if (!operator.success) {
        return jsonResponse_(operator);
      }

      const status = normalizeText(body.status);
      const result = getSignupRequests(status);
      result.canEditRequests = isSignupRequestEditor_(operator.user);
      return jsonResponse_(result);
    }

    if (action === "approveSignupRequest") {
      const operator = requireSignupAdminOperator_(body);

      if (!operator.success) {
        return jsonResponse_(operator);
      }

      const requestId = normalizeText(body.requestId);
      const approval = body.approval || {};

      return jsonResponse_(
        approveSignupRequest(requestId, approval, operator.operatorId, operator.user)
      );
    }

    if (action === "rejectSignupRequest") {
      const operator = requireSignupAdminOperator_(body);

      if (!operator.success) {
        return jsonResponse_(operator);
      }

      const requestId = normalizeText(body.requestId);

      return jsonResponse_(rejectSignupRequest(requestId, operator.operatorId));
    }
    // ===== signup系 POST ここまで =====

    return jsonResponse_({
      success: false,
      message: "Unknown POST action: " + action
    });

  } catch (error) {
    return jsonResponse_({
      success: false,
      ok: false,
      code: normalizeText(error.code || "SERVER_ERROR"),
      message: "POST処理中にエラーが発生しました: " + error.message
    });
  }
}
// ===== API入口ここまで =====


// ===== 共通レスポンスここから =====
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAction_(e) {
  return normalizeText(getParam_(e, "action"));
}

function getParam_(e, key) {
  if (!e || !e.parameter) {
    return "";
  }
  return e.parameter[key] || "";
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("POST body がありません");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("JSONの解析に失敗しました");
  }
}
// ===== 共通レスポンスここまで =====
