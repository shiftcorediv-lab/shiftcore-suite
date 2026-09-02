// ===== internal_user_id 発番ここから =====
function createNextInternalUserId_() {
  const sheet = getUsersSheet();
  const lastRow = sheet.getLastRow();

  let maxSeq = 0;

  if (lastRow >= 2) {
    const headerMap = getHeaderMap_(sheet);
    const col = headerMap["internal_user_id"];

    if (!col) {
      throw new Error("users_master に internal_user_id 列が見つかりません");
    }

    const values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();

    values.forEach(function(row) {
      const id = String(row[0] || "").trim();
      const match = id.match(/^U(\d+)$/);

      if (match) {
        const seq = Number(match[1]);
        if (seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
  }

  return "U" + String(maxSeq + 1).padStart(4, "0");
}
// ===== internal_user_id 発番ここまで =====


// ===== employee_code 自動採番ここから =====
function createNextEmployeeCode_() {
  const sheet = getUsersSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return "AN0001";
  }

  const headerMap = getHeaderMap_(sheet);
  const col = headerMap["employee_code"];

  if (!col) {
    throw new Error("users_master に employee_code 列が見つかりません");
  }

  const values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();

  let maxSeq = 0;

  values.forEach(function(row) {
    const code = String(row[0] || "").trim();
    const match = code.match(/^AN(\d{4})$/);

    if (match) {
      const seq = Number(match[1]);
      if (seq > maxSeq) {
        maxSeq = seq;
      }
    }
  });

  return "AN" + String(maxSeq + 1).padStart(4, "0");
}
// ===== employee_code 自動採番ここまで =====


// ===== users_master 追加ここから =====
function appendUserMasterFromSignup_(requestData, approval, operator) {
  const sheet = ensureUsersMasterSignupRequestColumn_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const internalUserId = createNextInternalUserId_();
  const employeeCode = createNextEmployeeCode_();

  const rowObject = {
    internal_user_id: internalUserId,
    employee_code: employeeCode,
    email: normalizeText(requestData.applicant_email),
    name: normalizeText(requestData.applicant_name),
    role: normalizeText(approval.role),
    organization_id: normalizeText(approval.organizationId),
    status: normalizeText(approval.status),
    allowed_modules: Array.isArray(approval.allowedModules)
      ? approval.allowedModules
          .map(function(v) { return normalizeText(v).toLowerCase(); })
          .filter(function(v) { return v !== ""; })
          .join(",")
      : normalizeText(approval.allowedModules).toLowerCase(),
    workStatus: normalizeText(approval.workStatus).toLowerCase(),
    work_status: normalizeText(approval.workStatus).toLowerCase(),
    engagement_status: normalizeText(approval.workStatus).toLowerCase() === "on"
      ? "active"
      : "inactive",
    phone: normalizeText(requestData.phone),
    note: normalizeText(requestData.note),
    signup_request_id: normalizeText(requestData.request_id)
  };

  const row = headers.map(function(header) {
    const key = String(header || "").trim();
    return escapeAccountSpreadsheetValue_(key in rowObject ? rowObject[key] : "");
  });

  const developerAuthorizationEventId = beginDeveloperAccountAuthorizationEvent_(
    operator,
    "",
    rowObject.role,
    internalUserId,
    "登録申請承認でdeveloperアカウントを作成"
  );

  const targetRow = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  completeDeveloperAccountAuthorizationEvent_(
    developerAuthorizationEventId,
    operator,
    "",
    rowObject.role,
    internalUserId,
    "登録申請承認でdeveloperアカウントを作成"
  );

  return internalUserId;
}
// ===== users_master 追加ここまで =====

function ensureUsersMasterSignupRequestColumn_() {
  const sheet = getUsersSheet();
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(header) {
    return normalizeText(header);
  });

  if (headers.indexOf("signup_request_id") === -1) {
    sheet.getRange(1, lastColumn + 1).setValue("signup_request_id");
  }

  return sheet;
}

function findUserBySignupRequestId_(requestId) {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return null;

  return getUsersData().find(function(user) {
    return normalizeText(user.signup_request_id) === normalizedRequestId;
  }) || null;
}
