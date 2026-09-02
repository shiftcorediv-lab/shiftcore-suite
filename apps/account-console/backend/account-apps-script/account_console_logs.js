// ===== Account Console 変更履歴ここから =====


// ===== 変更履歴取得ここから =====
function accountConsoleGetLogs(body) {
  requireAccountConsoleAuditViewer_(body);

  const targetUserId = normalizeText(
    body.targetUserId ||
    body.internal_user_id ||
    body.target_account_id
  );

  return listAccountConsoleLogs_(targetUserId);
}

function listAccountConsoleLogs_(targetUserId) {
  const sheet = getAccountConsoleLogsSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      success: true,
      ok: true,
      logs: []
    };
  }

  const headers = values[0].map(function(header) {
    return normalizeText(header);
  });

  let logs = values.slice(1).map(function(row) {
    return rowToAccountConsoleObject_(headers, row);
  });

  logs = logs.map(function(log) {
    return {
      log_id: normalizeText(log.log_id),
      changed_at: normalizeText(log.changed_at),
      changed_by: normalizeText(log.changed_by),
      target_account_id: normalizeText(log.target_account_id),
      target_email: normalizeAccountConsoleEmail_(log.target_email),
      field: normalizeText(log.field),
      before_value: normalizeText(log.before_value),
      after_value: normalizeText(log.after_value),
      memo: normalizeText(log.memo)
    };
  });

  if (targetUserId) {
    logs = logs.filter(function(log) {
      return log.target_account_id === targetUserId;
    });
  }

  logs.reverse();

  return {
    success: true,
    ok: true,
    logs: logs.slice(0, 200)
  };
}
// ===== 変更履歴取得ここまで =====


// ===== 変更履歴閲覧者確認ここから =====
function isAccountConsoleAuditViewer_(user) {
  const role = normalizeText(user && user.role).toLowerCase();
  return role === "admin" || role === "developer";
}

function requireAccountConsoleAuditViewer_(body) {
  const operator = requireAccountConsoleOperator_(body);
  if (!isAccountConsoleAuditViewer_(operator)) {
    const error = new Error("ACCOUNT_CONSOLE_AUDIT_VIEW_FORBIDDEN");
    error.code = "ACCOUNT_CONSOLE_AUDIT_VIEW_FORBIDDEN";
    throw error;
  }
  return operator;
}
// ===== 変更履歴閲覧者確認ここまで =====


// ===== 変更履歴追加ここから =====
function appendAccountConsoleLog_(params) {
  const sheet = getAccountConsoleLogsSheet_();

  const log = {
    log_id: generateAccountConsoleLogId_(),
    changed_at: getNowIsoStringJst(),
    changed_by: normalizeAccountConsoleEmail_(params.changedBy),
    target_account_id: normalizeText(params.targetUserId),
    target_email: normalizeAccountConsoleEmail_(params.targetEmail),
    field: normalizeText(params.field),
    before_value: String(params.beforeValue == null ? "" : params.beforeValue),
    after_value: String(params.afterValue == null ? "" : params.afterValue),
    memo: normalizeText(params.memo)
  };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(header) {
      return normalizeText(header);
    });

  const row = headers.map(function(header) {
    return escapeAccountSpreadsheetValue_(log[header] == null ? "" : log[header]);
  });

  sheet.appendRow(row);

  return log;
}
// ===== 変更履歴追加ここまで =====


// ===== 変更履歴シート取得ここから =====
function getAccountConsoleLogsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ACCOUNT_CHANGE_LOGS_SHEET_NAME);

  if (!sheet) {
    throw new Error(ACCOUNT_CHANGE_LOGS_SHEET_NAME + " シートが見つかりません");
  }

  return sheet;
}
// ===== 変更履歴シート取得ここまで =====


// ===== ログID生成ここから =====
function generateAccountConsoleLogId_() {
  const stamp = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHHmmss");
  const random = Math.floor(Math.random() * 1000000);

  return "LOG-" + stamp + "-" + String(random).padStart(6, "0");
}
// ===== ログID生成ここまで =====


// ===== Account Console 変更履歴ここまで =====
