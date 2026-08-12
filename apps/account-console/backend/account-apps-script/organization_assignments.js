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

  return {
    success: true,
    ok: true,
    editable: editable,
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
  if (!operatorId || operatorId === targetId) return false;
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
    const newErrors = findNewOrganizationErrors_(currentGraph.errors, candidateGraph.errors);
    if (newErrors.length) {
      throw organizationAuthorizationError_(newErrors[0].code);
    }

    const eventId = "ACE-" + Utilities.getUuid();
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: "organization.update",
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
        event_type: "organization.update",
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
  sheet, headers, rowNumber, before, after, operator, eventId, reason, originalError
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
      event_type: "organization.update",
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
  if (operatorId === targetId) {
    throw organizationAuthorizationError_("SELF_ESCALATION_FORBIDDEN");
  }
  if (currentLevel === "executive" && countActiveExecutives_(users) <= 1) {
    throw organizationAuthorizationError_("LAST_EXECUTIVE_PROTECTED");
  }
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

function findNewOrganizationErrors_(beforeErrors, afterErrors) {
  const before = {};
  (beforeErrors || []).forEach(function(item) {
    before[organizationErrorKey_(item)] = true;
  });
  return (afterErrors || []).filter(function(item) {
    return !before[organizationErrorKey_(item)];
  });
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
