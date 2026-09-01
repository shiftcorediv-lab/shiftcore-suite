// =========================
// API入口ここから
// =========================
function doGet(e) {
  try {
    const action = getAction_(e);

    if (action === "ping") {
      return jsonResponse_({
        success: true,
        message: "pong",
        environment: pmoRuntimeEnvironment_(),
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
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
  } catch (error) {
    return jsonResponse_({
      success: false,
      message: "処理が混み合っています。もう一度お試しください"
    });
  }

  try {
    const body = parseJsonBody_(e);
    const action = normalizeText(body.action || getAction_(e));

    if (action === "getPmoCurrentUserSecure") {
      return jsonResponse_(getPmoCurrentUserSecure(body.idToken));
    }

    if (action === "getLatestShiftRequestSecure") {
      return jsonResponse_(getLatestShiftRequestSecure(body.targetYearMonth, body.idToken));
    }

    if (action === "getPmoAdminMetaSecure") {
      const targetYearMonth = normalizeText(body.targetYearMonth);
      const idToken = normalizeText(body.idToken);

      return jsonResponse_(getPmoAdminMetaSecure(targetYearMonth, idToken));
    }

    if (action === "getPmoMonthlyTableSecure") {
      const targetYearMonth = normalizeText(body.targetYearMonth);
      const idToken = normalizeText(body.idToken);

      return jsonResponse_(getPmoMonthlyTableSecure(targetYearMonth, idToken));
    }

    if (action === "exportMonthlyExcelSecure") {
      const targetYearMonth = normalizeText(body.targetYearMonth);
      const idToken = normalizeText(body.idToken);

      return jsonResponse_(exportMonthlyExcelSecure(targetYearMonth, idToken));
    }

    if (action === "submitShiftRequestSecure") {
      return jsonResponse_(submitShiftRequestSecure(body.payload || {}, body.idToken));
    }

    return jsonResponse_({
      success: false,
      message: "Unknown POST action: " + action
    });
  } catch (error) {
    return jsonResponse_({
      success: false,
      code: normalizeText(error.code || "SERVER_ERROR"),
      message: "POST処理中にエラーが発生しました: " + error.message
    });
  } finally {
    lock.releaseLock();
  }
}
// =========================
// API入口ここまで
// =========================


// =========================
// 共通レスポンスここから
// =========================
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
// =========================
// 共通レスポンスここまで
// =========================
