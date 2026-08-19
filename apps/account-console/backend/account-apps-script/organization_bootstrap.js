// ===== 初回役員移行 ここから =====

function setupOrganizationAuthorizationStorage() {
  const properties = PropertiesService.getScriptProperties();
  assertOrganizationBootstrapEnabled_(properties);
  const actorId = normalizeText(
    properties.getProperty(ORGANIZATION_BOOTSTRAP_ACTOR_ID_PROPERTY)
  );
  const reason = normalizeText(
    properties.getProperty(ORGANIZATION_BOOTSTRAP_REASON_PROPERTY)
  );
  const activeUserEmail = normalizeAccountConsoleEmail_(Session.getActiveUser().getEmail());
  const actor = assertOrganizationBootstrapActor_(actorId, activeUserEmail, reason);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw organizationAuthorizationError_("ORGANIZATION_LOCK_TIMEOUT");
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    if (!usersSheet) {
      throw organizationAuthorizationError_("ORGANIZATION_SCHEMA_MISSING");
    }
    const lastColumn = usersSheet.getLastColumn();
    const headers = lastColumn > 0
      ? usersSheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(normalizeText)
      : [];
    assertNoDuplicateHeaders_(headers);
    const missingHeaders = ORGANIZATION_USER_HEADERS.filter(function(header) {
      return headers.indexOf(header) === -1;
    });
    if (missingHeaders.length) {
      usersSheet.getRange(1, lastColumn + 1, 1, missingHeaders.length)
        .setValues([missingHeaders]);
    }

    let logSheet = ss.getSheetByName(AUTHORIZATION_CHANGE_LOGS_SHEET_NAME);
    let createdLogSheet = false;
    if (!logSheet) {
      logSheet = ss.insertSheet(AUTHORIZATION_CHANGE_LOGS_SHEET_NAME);
      logSheet.getRange(1, 1, 1, AUTHORIZATION_CHANGE_LOG_HEADERS.length)
        .setValues([AUTHORIZATION_CHANGE_LOG_HEADERS]);
      createdLogSheet = true;
    } else {
      const logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn())
        .getDisplayValues()[0]
        .map(normalizeText);
      assertNoDuplicateHeaders_(logHeaders);
      if (AUTHORIZATION_CHANGE_LOG_HEADERS.some(function(header) {
        return logHeaders.indexOf(header) === -1;
      })) {
        throw organizationAuthorizationError_("ORGANIZATION_SCHEMA_MISMATCH");
      }
    }

    properties.setProperty(ORGANIZATION_SHADOW_ENABLED_PROPERTY, "false");
    appendAuthorizationChangeLog_({
      authorization_event_id: "ACE-" + Utilities.getUuid(),
      event_type: "organization.schema.initialize",
      actor_internal_user_id: actor.internal_user_id,
      before: { organization_headers: [] },
      after: {
        added_organization_headers: missingHeaders,
        created_authorization_change_logs: createdLogSheet
      },
      reason: reason,
      result: "success",
      source: "organization_bootstrap"
    });

    return {
      ok: true,
      added_organization_headers: missingHeaders,
      created_authorization_change_logs: createdLogSheet,
      organization_shadow_enabled: false
    };
  } finally {
    lock.releaseLock();
  }
}

function runOrganizationExecutiveBootstrap() {
  const properties = PropertiesService.getScriptProperties();
  assertOrganizationBootstrapEnabled_(properties);

  const executiveIds = normalizeBootstrapExecutiveIds_(
    properties.getProperty(ORGANIZATION_BOOTSTRAP_EXECUTIVE_IDS_PROPERTY)
  );
  const actorId = normalizeText(
    properties.getProperty(ORGANIZATION_BOOTSTRAP_ACTOR_ID_PROPERTY)
  );
  const reason = normalizeText(
    properties.getProperty(ORGANIZATION_BOOTSTRAP_REASON_PROPERTY)
  );

  const result = initializeOrganizationExecutives_({
    executive_user_ids: executiveIds,
    actor_internal_user_id: actorId,
    independent_auditor_user_id: normalizeText(properties.getProperty(
      AUTHORIZATION_INDEPENDENT_AUDITOR_ID_PROPERTY
    )),
    reason: reason,
    active_user_email: normalizeAccountConsoleEmail_(Session.getActiveUser().getEmail())
  });

  properties.setProperty(ORGANIZATION_SHADOW_ENABLED_PROPERTY, "true");
  properties.setProperty(ORGANIZATION_BOOTSTRAP_ENABLED_PROPERTY, "false");
  properties.deleteProperty(ORGANIZATION_BOOTSTRAP_EXECUTIVE_IDS_PROPERTY);
  properties.deleteProperty(ORGANIZATION_BOOTSTRAP_ACTOR_ID_PROPERTY);
  properties.deleteProperty(ORGANIZATION_BOOTSTRAP_REASON_PROPERTY);
  return result;
}

function runOrganizationExecutiveBootstrapRollback() {
  const properties = PropertiesService.getScriptProperties();
  assertOrganizationBootstrapEnabled_(properties);
  if (normalizeText(properties.getProperty(
    ORGANIZATION_SHADOW_ENABLED_PROPERTY
  )).toLowerCase() !== "false") {
    throw organizationAuthorizationError_("ORGANIZATION_SHADOW_MUST_BE_DISABLED");
  }

  const executiveIds = normalizeBootstrapExecutiveIds_(
    properties.getProperty(ORGANIZATION_BOOTSTRAP_EXECUTIVE_IDS_PROPERTY)
  );
  const actorId = normalizeText(properties.getProperty(
    ORGANIZATION_BOOTSTRAP_ACTOR_ID_PROPERTY
  ));
  const reason = normalizeText(properties.getProperty(
    ORGANIZATION_BOOTSTRAP_REASON_PROPERTY
  ));
  const activeUserEmail = normalizeAccountConsoleEmail_(Session.getActiveUser().getEmail());
  assertOrganizationBootstrapActor_(actorId, activeUserEmail, reason);
  if (executiveIds.length < 2 || new Set(executiveIds).size !== executiveIds.length) {
    throw organizationAuthorizationError_("BOOTSTRAP_EXECUTIVES_INVALID");
  }
  assertExecutiveBootstrapActorRole_(
    actorId,
    executiveIds,
    normalizeText(properties.getProperty(AUTHORIZATION_INDEPENDENT_AUDITOR_ID_PROPERTY))
  );
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw organizationAuthorizationError_("ORGANIZATION_LOCK_TIMEOUT");
  }

  try {
    const sheet = getUsersSheet();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(normalizeText);
    assertOrganizationHeaders_(headers);
    const users = values.slice(1).map(function(row) {
      return rowToOrganizationObject_(headers, row);
    });
    assertOrganizationBootstrapActorFromUsers_(users, actorId, activeUserEmail);
    const configuredIds = users.filter(function(user) {
      return normalizeOrganizationLevel_(user.organization_level) !== "";
    }).map(function(user) {
      return normalizeText(user.internal_user_id);
    }).sort();
    const expectedIds = executiveIds.slice().sort();
    if (JSON.stringify(configuredIds) !== JSON.stringify(expectedIds)) {
      throw organizationAuthorizationError_("BOOTSTRAP_ROLLBACK_SCOPE_FORBIDDEN");
    }

    const events = executiveIds.map(function(userId) {
      const index = users.findIndex(function(user) {
        return normalizeText(user.internal_user_id) === userId;
      });
      const before = users[index];
      if (index < 0 || normalizeOrganizationLevel_(before.organization_level) !== "executive" ||
          normalizeOrganizationVersion_(before.organization_version) !== 1) {
        throw organizationAuthorizationError_("BOOTSTRAP_ROLLBACK_SCOPE_FORBIDDEN");
      }
      const after = Object.assign({}, before, {
        organization_level: "",
        direct_manager_user_id: "",
        executive_reviewer_user_id: "",
        organization_version: "",
        organization_updated_at: "",
        organization_updated_by: ""
      });
      const eventId = "ACE-" + Utilities.getUuid();
      appendAuthorizationChangeLog_({
        authorization_event_id: eventId,
        event_type: "organization.bootstrap.rollback",
        actor_internal_user_id: actorId,
        target_internal_user_id: userId,
        before: organizationAuditSnapshot_(before),
        after: organizationAuditSnapshot_(after),
        reason: reason,
        result: "started",
        source: "organization_bootstrap"
      });
      return {
        eventId: eventId,
        event_type: "organization.bootstrap.rollback",
        change: { before: before, after: after, row_number: index + 2 }
      };
    });

    try {
      events.forEach(function(item) {
        writeOrganizationCandidate_(sheet, headers, item.change.row_number, item.change.after);
      });
      events.forEach(function(item) {
        appendAuthorizationChangeLog_({
          authorization_event_id: item.eventId,
          event_type: "organization.bootstrap.rollback",
          actor_internal_user_id: actorId,
          target_internal_user_id: item.change.before.internal_user_id,
          before: organizationAuditSnapshot_(item.change.before),
          after: organizationAuditSnapshot_(item.change.after),
          reason: reason,
          result: "success",
          source: "organization_bootstrap"
        });
      });
    } catch (error) {
      rollbackOrganizationBootstrap_(sheet, headers, events, actorId, reason, error);
      throw error;
    }

    properties.setProperty(ORGANIZATION_BOOTSTRAP_ENABLED_PROPERTY, "false");
    properties.deleteProperty(ORGANIZATION_BOOTSTRAP_EXECUTIVE_IDS_PROPERTY);
    properties.deleteProperty(ORGANIZATION_BOOTSTRAP_ACTOR_ID_PROPERTY);
    properties.deleteProperty(ORGANIZATION_BOOTSTRAP_REASON_PROPERTY);
    return { ok: true, rolled_back_executive_count: events.length };
  } finally {
    lock.releaseLock();
  }
}

function assertOrganizationBootstrapEnabled_(properties) {
  if (normalizeText(properties.getProperty(
    ORGANIZATION_BOOTSTRAP_ENABLED_PROPERTY
  )).toLowerCase() !== "true") {
    throw organizationAuthorizationError_("ORGANIZATION_BOOTSTRAP_DISABLED");
  }
}

function assertOrganizationBootstrapActor_(actorId, activeUserEmail, reason) {
  if (!normalizeText(actorId) || !normalizeText(reason) || !normalizeAccountConsoleEmail_(activeUserEmail)) {
    throw organizationAuthorizationError_("BOOTSTRAP_ACTOR_INVALID");
  }
  const actor = findOrganizationUserById_(actorId);
  if (!actor || normalizeAccountConsoleEmail_(actor.email) !== normalizeAccountConsoleEmail_(activeUserEmail) ||
      normalizeText(actor.status).toLowerCase() !== "active" ||
      getNormalizedPersonType(actor) !== "internal") {
    throw organizationAuthorizationError_("BOOTSTRAP_ACTOR_INVALID");
  }
  return actor;
}

function assertOrganizationBootstrapActorFromUsers_(users, actorId, activeUserEmail) {
  const actor = (users || []).find(function(user) {
    return normalizeText(user.internal_user_id) === normalizeText(actorId);
  });
  if (!actor || normalizeAccountConsoleEmail_(actor.email) !==
      normalizeAccountConsoleEmail_(activeUserEmail) ||
      normalizeText(actor.status).toLowerCase() !== "active" ||
      getNormalizedPersonType(actor) !== "internal") {
    throw organizationAuthorizationError_("BOOTSTRAP_ACTOR_INVALID");
  }
  return actor;
}

function assertNoDuplicateHeaders_(headers) {
  const seen = {};
  headers.forEach(function(header) {
    const key = normalizeText(header);
    if (!key) return;
    if (seen[key]) {
      throw organizationAuthorizationError_("ORGANIZATION_SCHEMA_MISMATCH");
    }
    seen[key] = true;
  });
}

function initializeOrganizationExecutives_(params) {
  const executiveIds = Array.isArray(params.executive_user_ids)
    ? params.executive_user_ids.map(normalizeText).filter(Boolean)
    : [];
  const actorId = normalizeText(params.actor_internal_user_id);
  const independentAuditorId = normalizeText(params.independent_auditor_user_id);
  const reason = normalizeText(params.reason);
  const activeUserEmail = normalizeAccountConsoleEmail_(params.active_user_email);

  if (executiveIds.length < 2 || new Set(executiveIds).size !== executiveIds.length) {
    throw organizationAuthorizationError_("BOOTSTRAP_EXECUTIVES_INVALID");
  }
  if (!actorId || !reason || !activeUserEmail) {
    throw organizationAuthorizationError_("BOOTSTRAP_ACTOR_INVALID");
  }
  assertExecutiveBootstrapActorRole_(actorId, executiveIds, independentAuditorId);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw organizationAuthorizationError_("ORGANIZATION_LOCK_TIMEOUT");
  }

  try {
    const sheet = getUsersSheet();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(normalizeText);
    assertOrganizationHeaders_(headers);
    const users = values.slice(1).map(function(row) {
      return rowToOrganizationObject_(headers, row);
    });
    if (users.some(function(user) {
      return normalizeOrganizationLevel_(user.organization_level) !== "";
    })) {
      throw organizationAuthorizationError_("ORGANIZATION_BOOTSTRAP_ALREADY_COMPLETED");
    }

    const actor = users.find(function(user) {
      return normalizeText(user.internal_user_id) === actorId;
    });
    if (!actor || normalizeAccountConsoleEmail_(actor.email) !== activeUserEmail ||
        normalizeText(actor.status).toLowerCase() !== "active" ||
        getNormalizedPersonType(actor) !== "internal") {
      throw organizationAuthorizationError_("BOOTSTRAP_ACTOR_INVALID");
    }

    const bootstrap = buildExecutiveBootstrapCandidates_(users, executiveIds, actorId);
    const graph = validateOrganizationGraph_(bootstrap.candidate_users);
    if (!graph.healthy) {
      throw organizationAuthorizationError_(graph.errors[0].code);
    }

    const events = bootstrap.changes.map(function(change) {
      const eventId = "ACE-" + Utilities.getUuid();
      appendAuthorizationChangeLog_({
        authorization_event_id: eventId,
        event_type: "organization.bootstrap",
        actor_internal_user_id: actorId,
        target_internal_user_id: change.after.internal_user_id,
        before: organizationAuditSnapshot_(change.before),
        after: organizationAuditSnapshot_(change.after),
        reason: reason,
        result: "started",
        source: "organization_bootstrap"
      });
      return { eventId: eventId, event_type: "organization.bootstrap", change: change };
    });

    try {
      events.forEach(function(item) {
        writeOrganizationCandidate_(
          sheet,
          headers,
          item.change.row_number,
          item.change.after
        );
      });
      events.forEach(function(item) {
        appendAuthorizationChangeLog_({
          authorization_event_id: item.eventId,
          event_type: "organization.bootstrap",
          actor_internal_user_id: actorId,
          target_internal_user_id: item.change.after.internal_user_id,
          before: organizationAuditSnapshot_(item.change.before),
          after: organizationAuditSnapshot_(item.change.after),
          reason: reason,
          result: "success",
          source: "organization_bootstrap"
        });
      });
    } catch (error) {
      rollbackOrganizationBootstrap_(sheet, headers, events, actorId, reason, error);
      throw error;
    }

    return {
      ok: true,
      initialized_executive_count: events.length,
      organization_shadow_effective: false
    };
  } finally {
    lock.releaseLock();
  }
}

function assertExecutiveBootstrapActorRole_(actorId, executiveIds, independentAuditorId) {
  const normalizedActorId = normalizeText(actorId);
  const normalizedExecutiveIds = (executiveIds || []).map(normalizeText);
  const normalizedAuditorId = normalizeText(independentAuditorId);
  if (normalizedExecutiveIds.indexOf(normalizedActorId) === -1 &&
      normalizedActorId !== normalizedAuditorId) {
    throw organizationAuthorizationError_("BOOTSTRAP_ACTOR_INVALID");
  }
  return true;
}

function buildExecutiveBootstrapCandidates_(users, executiveIds, actorId) {
  const now = getNowIsoStringJst();
  const changes = [];
  const byId = {};
  users.forEach(function(user, index) {
    byId[normalizeText(user.internal_user_id)] = { user: user, row_number: index + 2 };
  });

  executiveIds.forEach(function(userId, index) {
    const found = byId[userId];
    if (!found || normalizeText(found.user.status).toLowerCase() !== "active" ||
        getNormalizedPersonType(found.user) !== "internal") {
      throw organizationAuthorizationError_("BOOTSTRAP_EXECUTIVES_INVALID");
    }
    const reviewerId = executiveIds[(index + 1) % executiveIds.length];
    const after = Object.assign({}, found.user, {
      organization_level: "executive",
      direct_manager_user_id: "",
      executive_reviewer_user_id: reviewerId,
      organization_version: 1,
      organization_updated_at: now,
      organization_updated_by: actorId
    });
    changes.push({ before: found.user, after: after, row_number: found.row_number });
  });

  return {
    changes: changes,
    candidate_users: users.map(function(user) {
      const change = changes.find(function(item) {
        return normalizeText(item.after.internal_user_id) === normalizeText(user.internal_user_id);
      });
      return change ? change.after : user;
    })
  };
}

function rollbackOrganizationBootstrap_(sheet, headers, events, actorId, reason, originalError) {
  events.forEach(function(item) {
    let result = "error";
    try {
      writeOrganizationCandidate_(sheet, headers, item.change.row_number, item.change.before);
    } catch (rollbackError) {
      result = "recovery_required";
      recordAuthorizationRecovery_({
        authorization_event_id: item.eventId,
        target_internal_user_id: item.change.before.internal_user_id,
        error_code: normalizeText(originalError.code || originalError.message),
        rollback_error: normalizeText(rollbackError.code || rollbackError.message)
      });
    }
    try {
      appendAuthorizationChangeLog_({
        authorization_event_id: item.eventId,
        event_type: item.event_type || "organization.bootstrap",
        actor_internal_user_id: actorId,
        target_internal_user_id: item.change.before.internal_user_id,
        before: organizationAuditSnapshot_(item.change.before),
        after: organizationAuditSnapshot_(item.change.after),
        reason: reason,
        result: result,
        error_code: normalizeText(originalError.code || originalError.message),
        source: "organization_bootstrap"
      });
    } catch (auditError) {
      recordAuthorizationRecovery_({
        authorization_event_id: item.eventId,
        target_internal_user_id: item.change.before.internal_user_id,
        audit_error: normalizeText(auditError.code || auditError.message)
      });
    }
  });
}

function normalizeBootstrapExecutiveIds_(value) {
  return normalizeText(value).split(",").map(normalizeText).filter(Boolean);
}

// ===== 初回役員移行 ここまで =====
