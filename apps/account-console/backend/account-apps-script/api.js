// ===== API入口ここから =====
function doGet(e) {
  try {
    const action = getAction_(e);

    if (action === "ping") {
      return jsonResponse_({
        success: true,
        message: "pong",
        timestamp: getNowIsoStringJst()
      });
    }

    // ===== PMO系 GET ここから =====
    if (action === "getPmoRoster") {
      return jsonResponse_(getPmoRoster());
    }

    if (action === "getLatestShiftRequest") {
      const userId = normalizeText(getParam_(e, "userId"));
      const targetYearMonth = normalizeText(getParam_(e, "targetYearMonth"));

      return jsonResponse_(getLatestShiftRequest(userId, targetYearMonth));
    }

    if (action === "getPmoAdminMeta") {
      const targetYearMonth = normalizeText(getParam_(e, "targetYearMonth"));
      const role = normalizeText(getParam_(e, "role"));

      return jsonResponse_(getPmoAdminMeta(targetYearMonth, role));
    }

    if (action === "exportMonthlyExcel") {
      const targetYearMonth = normalizeText(getParam_(e, "targetYearMonth"));
      const role = normalizeText(getParam_(e, "role"));

      return jsonResponse_(exportMonthlyExcel(targetYearMonth, role));
    }
    // ===== PMO系 GET ここまで =====

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
    if (action === "checkLoginUserByEmail") {
      const email = normalizeText(body.email);

      if (!email) {
        return jsonResponse_({
          ok: false,
          code: "EMAIL_REQUIRED",
          message: "email が必要です"
        });
      }

      return jsonResponse_(checkLoginUserByEmail(email));
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

    if (action === "accountConsoleGetLogs") {
      return jsonResponse_(accountConsoleGetLogs(body));
    }
    // ===== Account Console系 POST ここまで =====


    // ===== PMO系 POST ここから =====
    if (action === "submitShiftRequest") {
      return jsonResponse_(submitShiftRequest(body.payload || body));
    }

    if (action === "createMonthlyRequestSheet") {
      const targetYearMonth = normalizeText(body.targetYearMonth);
      const roster = body.roster;

      return jsonResponse_(createMonthlyRequestSheet(targetYearMonth, roster));
    }
    // ===== PMO系 POST ここまで =====

    // ===== signup系 POST ここから =====
    if (action === "submitSignupRequest") {
      return jsonResponse_(submitSignupRequest(body.payload || body));
    }

    if (action === "getSignupRequestsSecure") {
      const operator = requireSignupAdminOperator_(body);

      if (!operator.success) {
        return jsonResponse_(operator);
      }

      const status = normalizeText(body.status);
      return jsonResponse_(getSignupRequests(status));
    }

    if (action === "approveSignupRequest") {
      const operator = requireSignupAdminOperator_(body);

      if (!operator.success) {
        return jsonResponse_(operator);
      }

      const requestId = normalizeText(body.requestId);
      const approval = body.approval || {};

      return jsonResponse_(approveSignupRequest(requestId, approval, operator.operatorId));
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
