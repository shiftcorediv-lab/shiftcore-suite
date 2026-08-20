// ===== 組織情報更新 ここから =====

function accountConsoleGetOrganizationAssignment(body) {
  const operatorPublic = requireAccountConsoleOperator_(body);
  const operator = findOrganizationUserById_(operatorPublic.internal_user_id || operatorPublic.userId);
  assertOrganizationOperator_(operator);

  const targetUserId = normalizeText(body.target_internal_user_id);
  const target = findOrganizationUserById_(targetUserId);
  assertInternalOrganizationTarget_(target);
  const users = getUsersData();
  const operatorLevel = normalizeOrganizationLevel_(operator.organization_level);
  const editable = canOperatorEditOrganizationTarget_(operator, target, users);
  const selfBootstrap = editable && canDeveloperBootstrapOwnOrganization_(operator, target);

  return {
    success: true,
    ok: true,
    editable: editable,
    self_bootstrap: selfBootstrap,
    allowed_organization_levels: selfBootstrap ? ["leader", "manager"] : [],
    organization: organizationAuditSnapshot_(target),
    candidates: (editable ? users : []).filter(function(user) {
      if (normalizeText(user.status).toLowerCase() !== "active") return false;
      if (!normalizeOrganizationLevel_(user.organization_level)) return false;
      if (normalizeText(user.internal_user_id) === targetUserId) return false;

      if (operatorLevel === "manager") {
        return normalizeText(user.internal_user_id) === normalizeText(operator.internal_user_id) ||
          normalizeText(user.direct_manager_user_id) === normalizeText(operator.internal_user_id);
      }
      return true;
    }).map(function(user) {
      return {
        internal_user_id: normalizeText(user.internal_user_id),
        display_name: normalizeText(user.display_name || user.name),
        organization_level: normalizeOrganizationLevel_(user.organization_level)
      };
    })
  };
}

function canOperatorEditOrganizationTarget_(operator, target, users) {
  const operatorId = normalizeText(operator.internal_user_id);
  const targetId = normalizeText(target.internal_user_id);
  const operatorLevel = normalizeOrganizationLevel_(operator.organization_level);
  const targetLevel = normalizeOrganizationLevel_(target.organization_level);
  if (!operatorId) return false;
  if (operatorId === targetId) {
    return canDeveloperBootstrapOwnOrganization_(operator, target);
  }
  if (isDeveloperOrganizationOperator_(operator)) return true;
  if (operatorLevel === "executive") return targetLevel !== "executive";
  if (operatorLevel === "manager") {
    return !targetLevel ||
      (targetLevel === "member" || targetLevel === "leader") &&
      isOrganizationCandidateInManagerTree_(operatorId, target, users || []);
  }
  return false;
}

function accountConsoleUpdateOrganizationAssignment(body) {
  if (!isOrganizationShadowEnabled_()) {
    throw organizationAuthorizationError_("ORGANIZATION_SHADOW_DISABLED");
  }
  const operatorPublic = requireAccountConsoleOperator_(body);
  const operator = findOrganizationUserById_(operatorPublic.internal_user_id || operatorPublic.userId);
  assertOrganizationOperator_(operator);
  const payload = body.payload || body;
  const reason = normalizeText(payload.reason);
  const targetUserId = normalizeText(payload.target_internal_user_id);

  if (!reason) {
    throw organizationAuthorizationError_("REASON_REQUIRED");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw organizationAuthorizationError_("ORGANIZATION_LOCK_TIMEOUT");
  }

  try {
    const sheet = getUsersSheet();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(normalizeText);
    assertOrganizationHeaders_(headers);
    const targetIndex = findOrganizationRowIndex_(values, headers, targetUserId);
    if (targetIndex < 1) {
      throw organizationAuthorizationError_("USER_NOT_FOUND");
    }

    const users = values.slice(1).map(function(row) {
      return rowToOrganizationObject_(headers, row);
    });
    const target = users[targetIndex - 1];
    assertInternalOrganizationTarget_(target);
    const candidate = buildOrganizationCandidate_(target, payload, operator);
    assertCanUpdateOrganizationAssignment_(operator, target, candidate, users);

    const expectedVersion = Number(payload.expected_organization_version || 0);
    const currentVersion = normalizeOrganizationVersion_(target.organization_version);
    if (expectedVersion !== currentVersion) {
      throw organizationAuthorizationError_("VERSION_CONFLICT");
    }

    const candidateUsers = users.map(function(user) {
      return normalizeText(user.internal_user_id) === targetUserId ? candidate : user;
    });
    const currentGraph = validateOrganizationGraph_(users);
    const candidateGraph = validateOrganizationGraph_(candidateUsers);
    const newErrors = findBlockingOrganizationErrors_(currentGraph.errors, candidateGraph.errors);
    if (newErrors.length) {
      throw organizationAuthorizationError_(newErrors[0].code);
    }

    const eventId = "ACE-" + Utilities.getUuid();
    const eventType = canDeveloperBootstrapOwnOrganization_(operator, target, candidate)
      ? "organization.self_bootstrap"
      : "organization.update";
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: eventType,
      actor_internal_user_id: operator.internal_user_id,
      target_internal_user_id: targetUserId,
      before: organizationAuditSnapshot_(target),
      after: organizationAuditSnapshot_(candidate),
      reason: reason,
      result: "started"
    });

    try {
      writeOrganizationCandidate_(sheet, headers, targetIndex + 1, candidate);
      appendAuthorizationChangeLog_({
        authorization_event_id: eventId,
        event_type: eventType,
        actor_internal_user_id: operator.internal_user_id,
        target_internal_user_id: targetUserId,
        before: organizationAuditSnapshot_(target),
        after: organizationAuditSnapshot_(candidate),
        reason: reason,
        result: "success"
      });
    } catch (writeError) {
      handleOrganizationUpdateFailure_(
        sheet,
        headers,
        targetIndex + 1,
        target,
        candidate,
        operator,
        eventId,
        reason,
        eventType,
        writeError
      );
      throw writeError;
    }

    return {
      success: true,
      ok: true,
      organization: organizationAuditSnapshot_(candidate)
    };
  } finally {
    lock.releaseLock();
  }
}

function accountConsoleBulkUpdateExecutives(body) {
  if (!isOrganizationShadowEnabled_()) {
    throw organizationAuthorizationError_("ORGANIZATION_SHADOW_DISABLED");
  }
  const operatorPublic = requireAccountConsoleOperator_(body);
  const operatorId = normalizeText(operatorPublic.internal_user_id || operatorPublic.userId);
  const operator = findOrganizationUserById_(operatorId);
  assertExecutiveBulkOperator_(operator);
  const payload = body.payload || body;
  const reason = normalizeText(payload.reason);
  if (!reason) {
    throw organizationAuthorizationError_("REASON_REQUIRED");
  }

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
    const lockedOperator = users.find(function(user) {
      return normalizeText(user.internal_user_id) === operatorId;
    });
    if (!lockedOperator) {
      throw organizationAuthorizationError_("USER_NOT_FOUND");
    }
    assertExecutiveBulkOperator_(lockedOperator);
    const prepared = prepareExecutiveBulkUpdate_(
      users,
      Array.isArray(payload.changes) ? payload.changes : [],
      lockedOperator
    );
    const eventId = "ACE-" + Utilities.getUuid();
    const requestId = "ACB-" + Utilities.getUuid();
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: "organization.executive.bulk_update",
      request_id: requestId,
      actor_internal_user_id: lockedOperator.internal_user_id,
      before: { changes: prepared.items.map(function(item) {
        return organizationAuditSnapshot_(item.before);
      }) },
      after: { changes: prepared.items.map(function(item) {
        return organizationAuditSnapshot_(item.after);
      }) },
      reason: reason,
      result: "started"
    });

    try {
      prepared.items.forEach(function(item) {
        writeOrganizationCandidate_(sheet, headers, item.row_number, item.after);
      });
      SpreadsheetApp.flush();
      assertExecutiveBulkWriteVerified_(sheet, headers, prepared.candidate_users, true);
      appendAuthorizationChangeLog_({
        authorization_event_id: eventId,
        event_type: "organization.executive.bulk_update",
        request_id: requestId,
        actor_internal_user_id: lockedOperator.internal_user_id,
        before: { changes: prepared.items.map(function(item) {
          return organizationAuditSnapshot_(item.before);
        }) },
        after: { changes: prepared.items.map(function(item) {
          return organizationAuditSnapshot_(item.after);
        }) },
        reason: reason,
        result: "success"
      });
    } catch (writeError) {
      handleExecutiveBulkUpdateFailure_(
        sheet, headers, prepared.items, prepared.original_users,
        lockedOperator, eventId, requestId, reason, writeError
      );
      throw writeError;
    }

    return {
      success: true,
      ok: true,
      request_id: requestId,
      change_count: prepared.items.length,
      organizations: prepared.items.map(function(item) {
        return organizationAuditSnapshot_(item.after);
      })
    };
  } finally {
    lock.releaseLock();
  }
}

function assertExecutiveBulkOperator_(operator) {
  if (!isDeveloperOrganizationOperator_(operator) ||
      getNormalizedPersonType(operator) !== "internal" ||
      normalizeText(operator.status).toLowerCase() !== "active") {
    throw organizationAuthorizationError_("CAPABILITY_FORBIDDEN");
  }
  return true;
}

function prepareExecutiveBulkUpdate_(users, rawChanges, operator) {
  const changes = Array.isArray(rawChanges) ? rawChanges : [];
  if (!changes.length || changes.length > 20) {
    throw organizationAuthorizationError_("BULK_CHANGES_INVALID");
  }
  const operatorId = normalizeText(operator && operator.internal_user_id);
  const seen = {};
  const items = changes.map(function(change) {
    const targetId = normalizeText(change && change.target_internal_user_id);
    if (!targetId || seen[targetId]) {
      throw organizationAuthorizationError_("BULK_TARGET_DUPLICATED");
    }
    seen[targetId] = true;
    if (targetId === operatorId) {
      throw organizationAuthorizationError_("SELF_ESCALATION_FORBIDDEN");
    }
    const index = users.findIndex(function(user) {
      return normalizeText(user.internal_user_id) === targetId;
    });
    if (index < 0) {
      throw organizationAuthorizationError_("USER_NOT_FOUND");
    }
    const before = users[index];
    assertInternalOrganizationTarget_(before);
    if (normalizeText(before.status).toLowerCase() !== "active") {
      throw organizationAuthorizationError_("ORGANIZATION_TARGET_INACTIVE");
    }
    const hasExpectedVersion = Object.prototype.hasOwnProperty.call(
      change, "expected_organization_version"
    );
    const expectedVersion = Number(change.expected_organization_version);
    if (!hasExpectedVersion || !Number.isInteger(expectedVersion) || expectedVersion < 0 ||
        expectedVersion !== normalizeOrganizationVersion_(before.organization_version)) {
      throw organizationAuthorizationError_("VERSION_CONFLICT");
    }
    const after = buildOrganizationCandidate_(before, change, operator);
    if (!normalizeOrganizationLevel_(after.organization_level)) {
      throw organizationAuthorizationError_("ORGANIZATION_LEVEL_INVALID");
    }
    if (normalizeOrganizationLevel_(before.organization_level) !== "executive" &&
        normalizeOrganizationLevel_(after.organization_level) !== "executive") {
      throw organizationAuthorizationError_("BULK_EXECUTIVE_TARGET_REQUIRED");
    }
    return { before: before, after: after, row_number: index + 2 };
  });

  const candidateUsers = users.map(function(user) {
    const item = items.find(function(candidate) {
      return normalizeText(candidate.before.internal_user_id) ===
        normalizeText(user.internal_user_id);
    });
    return item ? item.after : user;
  });
  if (countActiveExecutives_(candidateUsers) < 2) {
    throw organizationAuthorizationError_("LAST_EXECUTIVE_PROTECTED");
  }
  const beforeValidation = validateOrganizationGraph_(users);
  const afterValidation = validateOrganizationGraph_(candidateUsers);
  const newErrors = findNewOrganizationErrors_(beforeValidation.errors, afterValidation.errors);
  const executiveErrors = afterValidation.errors.filter(function(item) {
    return normalizeText(item.code).indexOf("EXECUTIVE_REVIEWER_") === 0;
  });
  if (executiveErrors.length || newErrors.length) {
    throw organizationAuthorizationError_((executiveErrors[0] || newErrors[0]).code);
  }
  return { items: items, candidate_users: candidateUsers, original_users: users };
}

function assertExecutiveBulkWriteVerified_(sheet, headers, expectedUsers, requireHealthyGraph) {
  const values = sheet.getDataRange().getValues();
  const actualUsers = values.slice(1).map(function(row) {
    return rowToOrganizationObject_(headers, row);
  });
  const expectedById = {};
  expectedUsers.forEach(function(user) {
    expectedById[normalizeText(user.internal_user_id)] = organizationAuditSnapshot_(user);
  });
  const actualById = {};
  actualUsers.forEach(function(user) {
    actualById[normalizeText(user.internal_user_id)] = organizationAuditSnapshot_(user);
  });
  const mismatch = Object.keys(expectedById).length !== Object.keys(actualById).length ||
    Object.keys(expectedById).some(function(userId) {
      return !actualById[userId] ||
        JSON.stringify(actualById[userId]) !== JSON.stringify(expectedById[userId]);
    }) || actualUsers.some(function(user) {
    const userId = normalizeText(user.internal_user_id);
    return !expectedById[userId];
  });
  const validation = validateOrganizationGraph_(actualUsers);
  if (mismatch || requireHealthyGraph && validation.errors.some(function(item) {
    return normalizeText(item.code).indexOf("EXECUTIVE_REVIEWER_") === 0;
  })) {
    throw organizationAuthorizationError_("BULK_WRITE_VERIFICATION_FAILED");
  }
  return true;
}

function handleExecutiveBulkUpdateFailure_(
  sheet, headers, items, originalUsers, operator, eventId, requestId, reason, originalError
) {
  let rollbackSucceeded = true;
  try {
    items.forEach(function(item) {
      writeOrganizationCandidate_(sheet, headers, item.row_number, item.before);
    });
    SpreadsheetApp.flush();
    assertExecutiveBulkWriteVerified_(sheet, headers, originalUsers, false);
  } catch (rollbackError) {
    rollbackSucceeded = false;
    recordAuthorizationRecovery_({
      authorization_event_id: eventId,
      error_code: normalizeText(originalError.code || originalError.message),
      rollback_error: normalizeText(rollbackError.code || rollbackError.message)
    });
  }
  try {
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: "organization.executive.bulk_update",
      request_id: requestId,
      actor_internal_user_id: operator.internal_user_id,
      before: { changes: items.map(function(item) {
        return organizationAuditSnapshot_(item.before);
      }) },
      after: { changes: items.map(function(item) {
        return organizationAuditSnapshot_(item.after);
      }) },
      reason: reason,
      result: rollbackSucceeded ? "error" : "recovery_required",
      error_code: normalizeText(originalError.code || originalError.message)
    });
  } catch (auditError) {
    recordAuthorizationRecovery_({
      authorization_event_id: eventId,
      error_code: normalizeText(originalError.code || originalError.message),
      audit_error: normalizeText(auditError.code || auditError.message),
      rollback_succeeded: rollbackSucceeded
    });
  }
}

function assertInternalOrganizationTarget_(target) {
  if (getNormalizedPersonType(target) !== "internal") {
    throw organizationAuthorizationError_("ORGANIZATION_TARGET_NOT_INTERNAL");
  }
}

function assertOrganizationOperator_(operator) {
  if (isDeveloperOrganizationOperator_(operator)) return true;
  const level = normalizeOrganizationLevel_(operator && operator.organization_level);
  if (level !== "manager" && level !== "executive") {
    throw organizationAuthorizationError_("CAPABILITY_FORBIDDEN");
  }
}

function isDeveloperOrganizationOperator_(operator) {
  return normalizeText(operator && operator.role).toLowerCase() === "developer";
}

function handleOrganizationUpdateFailure_(
  sheet, headers, rowNumber, before, after, operator, eventId, reason, eventType, originalError
) {
  let rollbackSucceeded = false;
  try {
    writeOrganizationCandidate_(sheet, headers, rowNumber, before);
    rollbackSucceeded = true;
  } catch (rollbackError) {
    recordAuthorizationRecovery_({
      authorization_event_id: eventId,
      target_internal_user_id: before.internal_user_id,
      error_code: normalizeText(originalError.code || originalError.message),
      rollback_error: normalizeText(rollbackError.code || rollbackError.message)
    });
  }

  try {
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: eventType,
      actor_internal_user_id: operator.internal_user_id,
      target_internal_user_id: before.internal_user_id,
      before: organizationAuditSnapshot_(before),
      after: organizationAuditSnapshot_(after),
      reason: reason,
      result: rollbackSucceeded ? "error" : "recovery_required",
      error_code: normalizeText(originalError.code || originalError.message)
    });
  } catch (auditError) {
    recordAuthorizationRecovery_({
      authorization_event_id: eventId,
      target_internal_user_id: before.internal_user_id,
      error_code: normalizeText(originalError.code || originalError.message),
      audit_error: normalizeText(auditError.code || auditError.message),
      rollback_succeeded: rollbackSucceeded
    });
  }
}

function recordAuthorizationRecovery_(item) {
  const properties = PropertiesService.getScriptProperties();
  const key = "AUTHORIZATION_RECOVERY_" + normalizeText(item.authorization_event_id);
  properties.setProperty(key, JSON.stringify(item));
}

function buildOrganizationCandidate_(target, payload, operator) {
  const now = getNowIsoStringJst();
  return Object.assign({}, target, {
    organization_level: normalizeOrganizationLevel_(payload.organization_level),
    direct_manager_user_id: normalizeText(payload.direct_manager_user_id),
    executive_reviewer_user_id: normalizeText(payload.executive_reviewer_user_id),
    organization_version: normalizeOrganizationVersion_(target.organization_version) + 1,
    organization_updated_at: now,
    organization_updated_by: normalizeText(operator.internal_user_id)
  });
}

function assertCanUpdateOrganizationAssignment_(operator, target, candidate, users) {
  const operatorId = normalizeText(operator && operator.internal_user_id);
  const targetId = normalizeText(target && target.internal_user_id);
  const operatorLevel = normalizeOrganizationLevel_(operator && operator.organization_level);
  const currentLevel = normalizeOrganizationLevel_(target && target.organization_level);
  const nextLevel = normalizeOrganizationLevel_(candidate && candidate.organization_level);

  const developerOperator = isDeveloperOrganizationOperator_(operator);
  if (!operatorId || !targetId || !nextLevel || !operatorLevel && !developerOperator) {
    throw organizationAuthorizationError_("ORGANIZATION_LEVEL_INVALID");
  }
  if (operatorId === targetId && !canDeveloperBootstrapOwnOrganization_(operator, target, candidate)) {
    throw organizationAuthorizationError_("SELF_ESCALATION_FORBIDDEN");
  }
  if (currentLevel === "executive" && countActiveExecutives_(users) <= 1) {
    throw organizationAuthorizationError_("LAST_EXECUTIVE_PROTECTED");
  }
  assertExecutiveGraphMutationUsesBulk_(target, candidate);
  if (developerOperator) return true;
  if (ORGANIZATION_LEVEL_RANKS[currentLevel] >= ORGANIZATION_LEVEL_RANKS[operatorLevel] ||
      ORGANIZATION_LEVEL_RANKS[nextLevel] >= ORGANIZATION_LEVEL_RANKS[operatorLevel]) {
    throw organizationAuthorizationError_("TARGET_LEVEL_FORBIDDEN");
  }
  if (operatorLevel === "manager" && ["member", "leader"].indexOf(nextLevel) === -1) {
    throw organizationAuthorizationError_("TARGET_LEVEL_FORBIDDEN");
  }
  if (operatorLevel !== "manager" && operatorLevel !== "executive") {
    throw organizationAuthorizationError_("CAPABILITY_FORBIDDEN");
  }
  if (currentLevel === "manager" || nextLevel === "manager" ||
      normalizeText(candidate.executive_reviewer_user_id)) {
    if (operatorLevel !== "executive") {
      throw organizationAuthorizationError_("TARGET_LEVEL_FORBIDDEN");
    }
  }

  if (operatorLevel === "manager" &&
      (!isOrganizationCandidateInManagerTree_(operatorId, candidate, users) ||
       currentLevel && !isOrganizationCandidateInManagerTree_(operatorId, target, users))) {
      throw organizationAuthorizationError_("SCOPE_FORBIDDEN");
  }

}

function assertExecutiveGraphMutationUsesBulk_(target, candidate) {
  const currentLevel = normalizeOrganizationLevel_(target && target.organization_level);
  const nextLevel = normalizeOrganizationLevel_(candidate && candidate.organization_level);
  const changesExecutiveMembership = currentLevel !== nextLevel &&
    (currentLevel === "executive" || nextLevel === "executive");
  const changesExecutiveReviewer = currentLevel === "executive" &&
    nextLevel === "executive" &&
    normalizeText(target && target.executive_reviewer_user_id) !==
      normalizeText(candidate && candidate.executive_reviewer_user_id);
  if (changesExecutiveMembership || changesExecutiveReviewer) {
    throw organizationAuthorizationError_("EXECUTIVE_BULK_UPDATE_REQUIRED");
  }
  return true;
}

function canDeveloperBootstrapOwnOrganization_(operator, target, candidate) {
  if (!isDeveloperOrganizationOperator_(operator) ||
      getNormalizedPersonType(operator) !== "internal" ||
      normalizeText(operator.status).toLowerCase() !== "active" ||
      normalizeText(operator.internal_user_id) !== normalizeText(target.internal_user_id) ||
      normalizeOrganizationLevel_(target.organization_level)) {
    return false;
  }
  if (!candidate) return true;
  return ["leader", "manager"].indexOf(
    normalizeOrganizationLevel_(candidate.organization_level)
  ) !== -1 &&
    Boolean(normalizeText(candidate.direct_manager_user_id)) &&
    !normalizeText(candidate.executive_reviewer_user_id);
}

function findNewOrganizationErrors_(beforeErrors, afterErrors) {
  const before = {};
  (beforeErrors || []).forEach(function(item) {
    before[organizationErrorKey_(item)] = true;
  });
  return (afterErrors || []).filter(function(item) {
    return !before[organizationErrorKey_(item)];
  });
}

function findBlockingOrganizationErrors_(beforeErrors, afterErrors) {
  return findNewOrganizationErrors_(beforeErrors, afterErrors);
}

function organizationErrorKey_(item) {
  return normalizeText(item.internal_user_id) + "\u001f" + normalizeText(item.code);
}

function isOrganizationCandidateInManagerTree_(managerId, candidate, users) {
  const level = normalizeOrganizationLevel_(candidate.organization_level);
  if (level === "leader") {
    return normalizeText(candidate.direct_manager_user_id) === managerId;
  }
  if (level !== "member") {
    return false;
  }

  const leaderId = normalizeText(candidate.direct_manager_user_id);
  const leader = users.find(function(user) {
    return normalizeText(user.internal_user_id) === leaderId;
  });
  return Boolean(leader) &&
    normalizeOrganizationLevel_(leader.organization_level) === "leader" &&
    normalizeText(leader.direct_manager_user_id) === managerId;
}

function countActiveExecutives_(users) {
  return users.filter(function(user) {
    return normalizeText(user.status).toLowerCase() === "active" &&
      normalizeOrganizationLevel_(user.organization_level) === "executive";
  }).length;
}

function findOrganizationUserById_(userId) {
  const normalizedId = normalizeText(userId);
  const user = getUsersData().find(function(item) {
    return normalizeText(item.internal_user_id) === normalizedId;
  });
  if (!user) {
    throw organizationAuthorizationError_("USER_NOT_FOUND");
  }
  return user;
}

function assertOrganizationHeaders_(headers) {
  [
    "internal_user_id", "organization_level", "direct_manager_user_id",
    "executive_reviewer_user_id", "organization_version",
    "organization_updated_at", "organization_updated_by"
  ].forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      throw organizationAuthorizationError_("ORGANIZATION_SCHEMA_MISSING");
    }
  });
}

function findOrganizationRowIndex_(values, headers, targetUserId) {
  const idIndex = headers.indexOf("internal_user_id");
  for (let index = 1; index < values.length; index += 1) {
    if (normalizeText(values[index][idIndex]) === targetUserId) {
      return index;
    }
  }
  return -1;
}

function rowToOrganizationObject_(headers, row) {
  const result = {};
  headers.forEach(function(header, index) { result[header] = row[index]; });
  return result;
}

function writeOrganizationCandidate_(sheet, headers, rowNumber, candidate) {
  [
    "organization_level", "direct_manager_user_id", "executive_reviewer_user_id",
    "organization_version", "organization_updated_at", "organization_updated_by"
  ].forEach(function(header) {
    sheet.getRange(rowNumber, headers.indexOf(header) + 1).setValue(candidate[header]);
  });
}

function organizationAuditSnapshot_(user) {
  return {
    internal_user_id: normalizeText(user.internal_user_id),
    organization_level: normalizeOrganizationLevel_(user.organization_level),
    direct_manager_user_id: normalizeText(user.direct_manager_user_id),
    executive_reviewer_user_id: normalizeText(user.executive_reviewer_user_id),
    organization_version: normalizeOrganizationVersion_(user.organization_version)
  };
}

// ===== 組織情報更新 ここまで =====
