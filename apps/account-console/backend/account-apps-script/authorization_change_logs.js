// ===== 権限・組織変更監査ログ ここから =====

function getAuthorizationChangeLogsSheet_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(AUTHORIZATION_CHANGE_LOGS_SHEET_NAME);
  if (!sheet) {
    throw authorizationChangeLogError_("AUDIT_WRITE_FAILED");
  }
  return sheet;
}

function appendAuthorizationChangeLog_(params) {
  const sheet = getAuthorizationChangeLogsSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(normalizeText);

  if (AUTHORIZATION_CHANGE_LOG_HEADERS.some(function(header) {
    return headers.indexOf(header) === -1;
  })) {
    throw authorizationChangeLogError_("AUDIT_WRITE_FAILED");
  }

  const previousHash = getPreviousAuthorizationLogHash_(sheet, headers);
  const entry = {
    authorization_change_log_id: "ACL-" + Utilities.getUuid(),
    authorization_event_id: normalizeText(params.authorization_event_id),
    occurred_at: getNowIsoStringJst(),
    event_type: normalizeText(params.event_type),
    request_id: normalizeText(params.request_id),
    actor_internal_user_id: normalizeText(params.actor_internal_user_id),
    target_internal_user_id: normalizeText(params.target_internal_user_id),
    reviewer_internal_user_id: normalizeText(params.reviewer_internal_user_id),
    before_json: safeAuthorizationLogJson_(params.before),
    after_json: safeAuthorizationLogJson_(params.after),
    reason: normalizeText(params.reason),
    result: normalizeText(params.result),
    error_code: normalizeText(params.error_code),
    source: normalizeText(params.source || "account_console"),
    previous_log_hash: previousHash
  };
  entry.log_hash = calculateAuthorizationLogHash_(entry);

  sheet.appendRow(headers.map(function(header) {
    return escapeAuthorizationSheetText_(entry[header]);
  }));
  saveAuthorizationLogAnchor_(sheet.getLastRow() - 1, entry.log_hash);
  return entry;
}

function getPreviousAuthorizationLogHash_(sheet, headers) {
  if (sheet.getLastRow() < 2) {
    return "";
  }
  const hashIndex = headers.indexOf("log_hash");
  return normalizeText(
    sheet.getRange(sheet.getLastRow(), hashIndex + 1).getDisplayValue()
  ).replace(/^'/, "");
}

function safeAuthorizationLogJson_(value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  return JSON.stringify(value);
}

function calculateAuthorizationLogHash_(entry) {
  const source = AUTHORIZATION_CHANGE_LOG_HEADERS
    .filter(function(header) { return header !== "log_hash"; })
    .map(function(header) {
      return normalizeAuthorizationLogHashValue_(header, entry[header]);
    })
    .join("\u001f");
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    source,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "");
}

function normalizeAuthorizationLogHashValue_(header, value) {
  const text = normalizeText(value);
  if (header === "occurred_at" && /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2}$/.test(text)) {
    const parts = text.split(" ");
    return parts[0] + "T" + parts[1].padStart(8, "0");
  }
  return text;
}

function runAuthorizationIntegrityAudit() {
  let result;
  try {
    result = verifyAuthorizationChangeLogIntegrity_();
  } catch (verificationError) {
    result = authorizationIntegrityResult_([
      normalizeText(verificationError.code || verificationError.message || "AUDIT_READ_FAILED")
    ], [], []);
  }
  try {
    const organizationErrors = verifyOrganizationGraphIntegrity_();
    result = authorizationIntegrityResult_(
      result.errors.concat(organizationErrors),
      result.incomplete_events,
      result.recovery_required
    );
  } catch (organizationError) {
    result = authorizationIntegrityResult_(
      result.errors.concat(["ORGANIZATION_GRAPH_AUDIT_FAILED"]),
      result.incomplete_events,
      result.recovery_required
    );
  }
  if (!result.healthy) {
    try {
      notifyAuthorizationIntegrityFailure_(result);
    } catch (notificationError) {
      result.notification_error = normalizeText(
        notificationError.code || notificationError.message
      );
    }
    const error = authorizationChangeLogError_("AUTHORIZATION_INTEGRITY_FAILED");
    error.details = result;
    throw error;
  }
  return result;
}

function verifyOrganizationGraphIntegrity_() {
  const validation = validateOrganizationGraph_(getUsersData());
  if (validation.healthy) return [];

  const counts = {};
  (validation.errors || []).forEach(function(item) {
    const code = normalizeText(item && item.code) || "UNKNOWN";
    counts[code] = (counts[code] || 0) + 1;
  });
  return Object.keys(counts).sort().map(function(code) {
    return "ORGANIZATION_GRAPH_UNHEALTHY:" + code + ":" + counts[code];
  });
}

function rebaselineAuthorizationLogAnchor() {
  const properties = PropertiesService.getScriptProperties();
  const enabled = normalizeText(
    properties.getProperty(AUTHORIZATION_ANCHOR_REBASE_ENABLED_PROPERTY)
  ).toLowerCase();
  const reason = normalizeText(
    properties.getProperty(AUTHORIZATION_ANCHOR_REBASE_REASON_PROPERTY)
  );
  if (enabled !== "true" || !reason) {
    throw authorizationChangeLogError_("AUTHORIZATION_ANCHOR_REBASE_NOT_APPROVED");
  }

  try {
    const result = verifyAuthorizationChangeLogIntegrity_({ skip_anchor: true });
    if (!result.healthy) {
      const error = authorizationChangeLogError_("AUTHORIZATION_ANCHOR_REBASE_UNSAFE");
      error.details = result;
      throw error;
    }
    const sheet = getAuthorizationChangeLogsSheet_();
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0].map(normalizeText);
    const hashIndex = headers.indexOf("log_hash");
    const lastHash = values.length > 1
      ? restoreAuthorizationSheetText_(values[values.length - 1][hashIndex])
      : "";
    const previousAnchor = normalizeText(
      properties.getProperty(AUTHORIZATION_LOG_ANCHOR_PROPERTY)
    );
    const event = appendAuthorizationChangeLog_({
      authorization_event_id: "ACE-" + Utilities.getUuid(),
      event_type: "audit.anchor.rebaseline",
      before: { anchor: previousAnchor },
      after: {
        verified_data_row_count: values.length - 1,
        verified_log_hash: lastHash
      },
      reason: reason,
      result: "success",
      source: "apps_script_manual"
    });
    return {
      success: true,
      data_row_count: values.length,
      reason: reason,
      authorization_event_id: event.authorization_event_id
    };
  } finally {
    properties.setProperty(AUTHORIZATION_ANCHOR_REBASE_ENABLED_PROPERTY, "false");
    properties.deleteProperty(AUTHORIZATION_ANCHOR_REBASE_REASON_PROPERTY);
  }
}

function verifyAuthorizationChangeLogIntegrity_(options) {
  const settings = options || {};
  const sheet = getAuthorizationChangeLogsSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) {
    return authorizationIntegrityResult_(["AUDIT_HEADERS_MISSING"], [], []);
  }

  const headers = values[0].map(normalizeText);
  const missingHeaders = AUTHORIZATION_CHANGE_LOG_HEADERS.filter(function(header) {
    return headers.indexOf(header) === -1;
  });
  if (missingHeaders.length) {
    return authorizationIntegrityResult_(["AUDIT_HEADERS_MISSING"], [], []);
  }

  const errors = [];
  const eventStates = {};
  let expectedPreviousHash = "";

  values.slice(1).forEach(function(row, index) {
    const entry = {};
    headers.forEach(function(header, columnIndex) {
      entry[header] = restoreAuthorizationSheetText_(row[columnIndex]);
    });

    const rowNumber = index + 2;
    if (normalizeText(entry.previous_log_hash) !== expectedPreviousHash) {
      errors.push("HASH_PREVIOUS_MISMATCH:" + rowNumber);
    }
    const storedHash = normalizeText(entry.log_hash);
    if (!storedHash || calculateAuthorizationLogHash_(entry) !== storedHash) {
      errors.push("HASH_VALUE_MISMATCH:" + rowNumber);
    }
    expectedPreviousHash = storedHash;

    const eventId = normalizeText(entry.authorization_event_id);
    const result = normalizeText(entry.result);
    if (eventId) {
      if (!eventStates[eventId]) eventStates[eventId] = [];
      eventStates[eventId].push(result);
    }
  });

  const incompleteEvents = [];
  const recoveryRequiredEvents = [];
  Object.keys(eventStates).forEach(function(eventId) {
    const states = eventStates[eventId];
    if (states.indexOf("recovery_required") !== -1) {
      recoveryRequiredEvents.push(eventId);
    }
    if (states.indexOf("started") !== -1 &&
        !states.some(function(state) {
          return ["success", "error", "rejected", "conflict", "recovery_required"].indexOf(state) !== -1;
        })) {
      incompleteEvents.push(eventId);
    }
  });

  const recoveryProperties = Object.keys(
    PropertiesService.getScriptProperties().getProperties()
  ).filter(function(key) {
    return key.indexOf("AUTHORIZATION_RECOVERY_") === 0;
  });

  const anchorErrors = settings.skip_anchor ? [] : verifyAuthorizationLogAnchor_(
      PropertiesService.getScriptProperties(),
      values.length - 1,
      expectedPreviousHash
    );

  return authorizationIntegrityResult_(
    errors.concat(anchorErrors),
    incompleteEvents,
    recoveryRequiredEvents.concat(recoveryProperties)
  );
}

function saveAuthorizationLogAnchor_(dataRowCount, logHash) {
  PropertiesService.getScriptProperties().setProperty(
    AUTHORIZATION_LOG_ANCHOR_PROPERTY,
    JSON.stringify({
      data_row_count: Number(dataRowCount || 0),
      log_hash: normalizeText(logHash),
      anchored_at: getNowIsoStringJst()
    })
  );
}

function verifyAuthorizationLogAnchor_(properties, dataRowCount, logHash) {
  const raw = normalizeText(properties.getProperty(AUTHORIZATION_LOG_ANCHOR_PROPERTY));
  if (!raw) {
    return dataRowCount > 0 ? ["AUDIT_ANCHOR_MISSING"] : [];
  }
  try {
    const anchor = JSON.parse(raw);
    const errors = [];
    if (Number(anchor.data_row_count) !== Number(dataRowCount)) {
      errors.push("AUDIT_ANCHOR_ROW_COUNT_MISMATCH");
    }
    if (normalizeText(anchor.log_hash) !== normalizeText(logHash)) {
      errors.push("AUDIT_ANCHOR_HASH_MISMATCH");
    }
    return errors;
  } catch (error) {
    return ["AUDIT_ANCHOR_INVALID"];
  }
}

function setupAuthorizationIntegrityDailyTrigger() {
  const recipients = resolveAuthorizationIntegrityRecipients_();
  assertAuthorizationIntegrityRecipientRoles_(
    parseAuthorizationRecipientIdsProperty_(AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS_PROPERTY),
    normalizeText(PropertiesService.getScriptProperties().getProperty(
      AUTHORIZATION_INDEPENDENT_AUDITOR_ID_PROPERTY
    ))
  );
  const existing = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === AUTHORIZATION_INTEGRITY_TRIGGER_FUNCTION;
  });
  if (!existing) {
    ScriptApp.newTrigger(AUTHORIZATION_INTEGRITY_TRIGGER_FUNCTION)
      .timeBased()
      .everyDays(1)
      .atHour(6)
      .create();
  }
  return {
    success: true,
    already_exists: existing,
    recipient_count: recipients.length
  };
}

function sendAuthorizationIntegrityTestNotification() {
  const recipients = resolveAuthorizationIntegrityRecipients_();
  MailApp.sendEmail({
    to: recipients.map(function(item) { return item.email; }).join(","),
    subject: "[ShiftCore] 権限監査通知テスト",
    body: "権限監査ログの通知先設定テストです。実際の異常は検出されていません。"
  });
  return { success: true, recipient_count: recipients.length };
}

function removeAuthorizationIntegrityDailyTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === AUTHORIZATION_INTEGRITY_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return { success: true, removed: removed };
}

function notifyAuthorizationIntegrityFailure_(result) {
  const resolution = resolveAvailableAuthorizationIntegrityRecipients_();
  if (!resolution.recipients.length) {
    throw authorizationChangeLogError_("AUTHORIZATION_RECIPIENTS_UNAVAILABLE");
  }
  const notificationResult = Object.assign({}, result, {
    unavailable_recipient_count: resolution.invalid_count
  });
  MailApp.sendEmail({
    to: resolution.recipients.map(function(item) { return item.email; }).join(","),
    subject: "[ShiftCore] 権限監査ログの整合性異常",
    body: "権限監査ログの整合性検査で異常を検出しました。\n" +
      JSON.stringify(notificationResult)
  });
}

function resolveAuthorizationIntegrityRecipients_() {
  const ids = parseAuthorizationRecipientIdsProperty_(
    AUTHORIZATION_INTEGRITY_RECIPIENT_IDS_PROPERTY
  );
  if (!ids.length) {
    throw authorizationChangeLogError_("AUTHORIZATION_RECIPIENT_IDS_REQUIRED");
  }

  const users = getUsersData();
  return ids.map(function(id) {
    const user = users.find(function(item) {
      return normalizeText(item.internal_user_id) === id;
    });
    const email = normalizeText(user && user.email).toLowerCase();
    if (!user || normalizeText(user.status).toLowerCase() !== "active" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw authorizationChangeLogError_("AUTHORIZATION_RECIPIENT_INVALID");
    }
    return { internal_user_id: id, email: email };
  });
}

function resolveAvailableAuthorizationIntegrityRecipients_() {
  const ids = parseAuthorizationRecipientIdsProperty_(
    AUTHORIZATION_INTEGRITY_RECIPIENT_IDS_PROPERTY
  );
  const users = getUsersData();
  const recipients = [];
  let invalidCount = 0;
  ids.forEach(function(id) {
    const user = users.find(function(item) {
      return normalizeText(item.internal_user_id) === id;
    });
    const email = normalizeText(user && user.email).toLowerCase();
    if (!user || normalizeText(user.status).toLowerCase() !== "active" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalidCount += 1;
      return;
    }
    recipients.push({ internal_user_id: id, email: email });
  });
  return { recipients: recipients, invalid_count: invalidCount };
}

function parseAuthorizationRecipientIdsProperty_(propertyName) {
  const raw = normalizeText(
    PropertiesService.getScriptProperties().getProperty(propertyName)
  );
  return Array.from(new Set(raw.split(",").map(normalizeText).filter(Boolean)));
}

function assertAuthorizationIntegrityRecipientRoles_(executiveIds, auditorId) {
  const configured = resolveAuthorizationIntegrityRecipients_().map(function(item) {
    return item.internal_user_id;
  });
  const expectedExecutives = Array.from(new Set((executiveIds || []).map(normalizeText)));
  const independentAuditorId = normalizeText(auditorId);
  if (!independentAuditorId || expectedExecutives.indexOf(independentAuditorId) !== -1 ||
      expectedExecutives.some(function(id) { return configured.indexOf(id) === -1; }) ||
      configured.indexOf(independentAuditorId) === -1) {
    throw authorizationChangeLogError_("AUTHORIZATION_RECIPIENT_ROLE_MISMATCH");
  }
  return true;
}

function authorizationIntegrityResult_(errors, incompleteEvents, recoveryItems) {
  const uniqueRecoveryItems = Array.from(new Set(recoveryItems || []));
  return {
    healthy: !(errors || []).length && !(incompleteEvents || []).length && !uniqueRecoveryItems.length,
    errors: errors || [],
    incomplete_events: incompleteEvents || [],
    recovery_required: uniqueRecoveryItems
  };
}

function restoreAuthorizationSheetText_(value) {
  const text = normalizeText(value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function authorizationChangeLogError_(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// ===== 権限・組織変更監査ログ ここまで =====
