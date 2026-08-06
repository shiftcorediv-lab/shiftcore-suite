// ===== 権限割当シート ここから =====
function getPermissionAssignmentsSheet_() {
  return SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(PERMISSION_ASSIGNMENTS_SHEET_NAME);
}

function getAuthorizationShadowLogsSheet_() {
  return SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(AUTHORIZATION_SHADOW_LOGS_SHEET_NAME);
}

function setupAuthorizationSheets() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  ensureAuthorizationSheet_(
    spreadsheet,
    PERMISSION_ASSIGNMENTS_SHEET_NAME,
    PERMISSION_ASSIGNMENT_HEADERS
  );
  ensureAuthorizationSheet_(
    spreadsheet,
    AUTHORIZATION_SHADOW_LOGS_SHEET_NAME,
    AUTHORIZATION_SHADOW_LOG_HEADERS
  );

  return {
    ok: true,
    created_or_verified: [
      PERMISSION_ASSIGNMENTS_SHEET_NAME,
      AUTHORIZATION_SHADOW_LOGS_SHEET_NAME
    ]
  };
}

function ensureAuthorizationSheet_(spreadsheet, sheetName, expectedHeaders) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.setFrozenRows(1);
    if (sheetName === AUTHORIZATION_SHADOW_LOGS_SHEET_NAME) {
      sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    }
    return sheet;
  }

  const lastColumn = sheet.getLastColumn();
  const actualHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    : [];

  if (actualHeaders.join("\u001f") !== expectedHeaders.join("\u001f")) {
    throw new Error(sheetName + " の見出しが権限契約と一致しません");
  }

  return sheet;
}

function getPermissionAssignmentRows_() {
  const sheet = getPermissionAssignmentsSheet_();

  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(normalizeText);

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(value) {
        return normalizeText(value) !== "";
      });
    })
    .map(function(row) {
      const item = {};
      headers.forEach(function(header, index) {
        item[header] = row[index];
      });
      return item;
    });
}

function getActivePermissionAssignmentsForUser_(internalUserId, nowDate) {
  const targetUserId = normalizeText(internalUserId);
  const today = Utilities.formatDate(
    nowDate || new Date(),
    "Asia/Tokyo",
    "yyyy-MM-dd"
  );

  if (!targetUserId) {
    return [];
  }

  return getPermissionAssignmentRows_().filter(function(item) {
    if (normalizeText(item.internal_user_id) !== targetUserId) {
      return false;
    }

    if (normalizeText(item.status).toLowerCase() !== "active") {
      return false;
    }

    const dates = validatePermissionAssignmentDates_(item);
    const validFrom = dates.valid_from;
    const validTo = dates.valid_to;

    if (validFrom && validFrom > today) {
      return false;
    }

    if (validTo && validTo < today) {
      return false;
    }

    return true;
  });
}

function validatePermissionAssignment_(item) {
  const moduleCode = normalizeText(item.module_code);
  const capabilityCode = normalizeText(item.capability_code);
  const scopeType = normalizeText(item.scope_type);
  const scopeValue = normalizeText(item.scope_value);

  if (VALID_PERMISSION_MODULE_CODES.indexOf(moduleCode) === -1) {
    throw new Error("不正なmodule_codeです: " + moduleCode);
  }

  const validCapabilities = VALID_PERMISSION_CAPABILITIES_BY_MODULE[moduleCode] || [];

  if (validCapabilities.indexOf(capabilityCode) === -1) {
    throw new Error("module_codeとcapability_codeが一致しません: " + moduleCode + " / " + capabilityCode);
  }

  if (VALID_PERMISSION_SCOPE_TYPES.indexOf(scopeType) === -1) {
    throw new Error("不正なscope_typeです: " + scopeType);
  }

  if ((scopeType === "organization" || scopeType === "area") && !scopeValue) {
    throw new Error("scope_valueが必要です: " + scopeType);
  }

  if ((scopeType === "all" || scopeType === "self") && scopeValue) {
    throw new Error("scope_valueは空欄にしてください: " + scopeType);
  }

  validatePermissionAssignmentDates_(item);

  return {
    module_code: moduleCode,
    capability_code: capabilityCode,
    scope_type: scopeType,
    scope_value: scopeValue
  };
}

function validatePermissionAssignmentDates_(item) {
  const validFrom = normalizeText(item.valid_from);
  const validTo = normalizeText(item.valid_to);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (validFrom && !datePattern.test(validFrom)) {
    throw new Error("valid_fromはYYYY-MM-DD形式で指定してください");
  }

  if (validTo && !datePattern.test(validTo)) {
    throw new Error("valid_toはYYYY-MM-DD形式で指定してください");
  }

  if (validFrom && validTo && validFrom > validTo) {
    throw new Error("valid_fromはvalid_to以前の日付にしてください");
  }

  return {
    valid_from: validFrom,
    valid_to: validTo
  };
}
// ===== 権限割当シート ここまで =====
