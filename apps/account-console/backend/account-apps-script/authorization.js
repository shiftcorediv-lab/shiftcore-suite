// ===== 共通権限コンテキスト ここから =====
function resolveAuthorizationContextByIdToken_(body) {
  const idToken = normalizeText(body && body.idToken);

  if (!idToken) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: "idToken が必要です"
    };
  }

  const resolved = resolveCurrentUserByIdToken(idToken);

  if (!resolved || resolved.ok !== true || !resolved.user) {
    return {
      ok: false,
      code: resolved && resolved.code || "AUTH_INVALID",
      message: resolved && resolved.message || "ログインユーザーを確認できません"
    };
  }

  const user = resolved.user;
  const organizationUser = findAuthorizationOrganizationUser_(user);
  const legacyModules = buildLegacyAuthorizationModules_(user);
  const organizationShadow = resolveOrganizationShadowContext_(organizationUser);
  let enforcementMode;

  try {
    enforcementMode = resolveAuthorizationEnforcementMode_();
  } catch (error) {
    return {
      ok: false,
      code: "AUTHORIZATION_MODE_INVALID",
      message: "実効権限モードの設定を確認できません"
    };
  }

  const effectiveMode = enforcementMode === "effective";
  let assignedModules = {};
  let effectiveModules = effectiveMode
    ? buildEffectiveAuthorizationModules_(legacyModules, {})
    : {};
  let configured = false;
  let shadowError = false;
  let shadowEnabled = false;

  try {
    shadowEnabled = isAuthorizationShadowEnabled_();
  } catch (error) {
    shadowError = true;
    console.error("Authorization Shadow switch resolution failed", error);
  }

  if (shadowEnabled || effectiveMode) {
    try {
      const assignments = getActivePermissionAssignmentsForUser_(user.internal_user_id);
      configured = assignments.length > 0;
      assignedModules = configured
        ? buildAssignedAuthorizationModules_(assignments)
        : {};
      if (effectiveMode) {
        effectiveModules = buildEffectiveAuthorizationModules_(legacyModules, assignedModules);
      }
    } catch (error) {
      shadowError = true;
      configured = false;
      assignedModules = {};
      console.error("Authorization Shadow candidate resolution failed", error);
    }
  }

  let differences = [];

  if (!effectiveMode && configured && !shadowError) {
    try {
      differences = compareAuthorizationModules_(legacyModules, assignedModules);
    } catch (error) {
      shadowError = true;
      differences = [];
      console.error("Authorization Shadow comparison failed", error);
    }
  }
  let loggingAvailable = false;
  let shadowLogSheet = null;

  if (!effectiveMode) {
    try {
      shadowLogSheet = getAuthorizationShadowLogsSheet_();
      loggingAvailable = Boolean(shadowLogSheet);
    } catch (error) {
      shadowError = true;
      console.error("Authorization Shadow log sheet resolution failed", error);
    }
  }

  if (!effectiveMode && configured && !shadowError) {
    try {
      loggingAvailable = appendAuthorizationShadowDifferences_(
        shadowLogSheet,
        user.internal_user_id,
        differences
      );
      if (!loggingAvailable) {
        shadowError = true;
      }
    } catch (error) {
      shadowError = true;
      console.error("Authorization Shadow logging failed", error);
    }
  }

  return {
    ok: true,
    user: buildAuthorizationPublicUser_(user, organizationUser),
    authorization: {
      version: 1,
      mode: enforcementMode,
      source: effectiveMode
        ? (shadowError ? "assigned_unavailable" : "assigned_effective")
        : (configured ? "legacy_shadow" : "legacy"),
      legacy_fallback: !effectiveMode,
      modules: effectiveMode ? effectiveModules : legacyModules,
      candidate_modules: effectiveMode ? {} : (configured ? assignedModules : {}),
      shadow: {
        enabled: !effectiveMode && configured,
        healthy: !shadowError,
        logging_available: loggingAvailable,
        differences: differences
      },
      organization_shadow: organizationShadow
    }
  };
}

function resolveAuthorizationEnforcementMode_() {
  const value = normalizeText(
    PropertiesService.getScriptProperties().getProperty(
      AUTHORIZATION_ENFORCEMENT_MODE_PROPERTY
    )
  ).toLowerCase();

  if (!value || value === "shadow") {
    return "shadow";
  }

  if (value === "effective") {
    return "effective";
  }

  throw new Error("AUTHORIZATION_ENFORCEMENT_MODE_INVALID");
}

function buildEffectiveAuthorizationModules_(legacyModules, assignedModules) {
  const modules = {};
  Object.keys(legacyModules || {}).forEach(function(moduleCode) {
    if (AUTHORIZATION_SHADOW_MODULE_CODES.indexOf(moduleCode) === -1) {
      modules[moduleCode] = legacyModules[moduleCode];
    }
  });
  Object.keys(assignedModules || {}).forEach(function(moduleCode) {
    if (AUTHORIZATION_SHADOW_MODULE_CODES.indexOf(moduleCode) !== -1) {
      modules[moduleCode] = assignedModules[moduleCode];
    }
  });
  sortAuthorizationModules_(modules);
  return modules;
}

function previewAuthorizationEffectiveCutover() {
  const users = getUsersData();
  const migratedUserIds = normalizeAuthorizationCutoverUserIds_(
    PropertiesService.getScriptProperties().getProperty(
      AUTHORIZATION_CUTOVER_MIGRATED_USER_IDS_PROPERTY
    )
  );
  const activeInternalUserIds = {};
  let activeInternalUsers = 0;
  let usersWithLegacyAccess = 0;
  let configuredUsers = 0;
  let unconfiguredUsers = 0;
  let invalidUsers = 0;

  users.forEach(function(user) {
    if (normalizeText(user.status).toLowerCase() !== "active" ||
        getNormalizedPersonType(user) !== "internal") {
      return;
    }
    activeInternalUsers += 1;
    activeInternalUserIds[normalizeText(user.internal_user_id)] = true;
    const managedLegacyModules = Object.keys(buildLegacyAuthorizationModules_(user)).filter(
      function(moduleCode) {
        return AUTHORIZATION_SHADOW_MODULE_CODES.indexOf(moduleCode) !== -1;
      }
    );
    if (managedLegacyModules.length) usersWithLegacyAccess += 1;
    if (migratedUserIds.indexOf(normalizeText(user.internal_user_id)) === -1) {
      unconfiguredUsers += 1;
      return;
    }
    try {
      const assignments = getActivePermissionAssignmentsForUser_(user.internal_user_id);
      buildAssignedAuthorizationModules_(assignments);
      configuredUsers += 1;
    } catch (error) {
      invalidUsers += 1;
    }
  });

  const unknownMigratedUsers = migratedUserIds.filter(function(userId) {
    return !activeInternalUserIds[userId];
  }).length;

  return {
    ok: unconfiguredUsers === 0 && invalidUsers === 0 && unknownMigratedUsers === 0,
    mode: resolveAuthorizationEnforcementMode_(),
    active_internal_users: activeInternalUsers,
    users_with_legacy_access: usersWithLegacyAccess,
    configured_users: configuredUsers,
    unconfigured_users: unconfiguredUsers,
    invalid_users: invalidUsers,
    unknown_migrated_users: unknownMigratedUsers
  };
}

function runAuthorizationEffectiveCutoverPreview() {
  const result = previewAuthorizationEffectiveCutover();
  console.log("AUTHORIZATION_CUTOVER_PREVIEW " + JSON.stringify(result));
  return result;
}

function runAuthorizationLegacyAssignmentMigrationPreview() {
  const analysis = analyzeAuthorizationLegacyAssignmentMigration_();
  const summary = analysis.summary;
  console.log("AUTHORIZATION_LEGACY_MIGRATION_PREVIEW " + JSON.stringify(summary));
  return summary;
}

function analyzeAuthorizationLegacyAssignmentMigration_() {
  const summary = {
    mode: resolveAuthorizationEnforcementMode_(),
    active_internal_users: 0,
    users_with_legacy_access: 0,
    users_with_active_managed_assignments: 0,
    equivalent_users: 0,
    equivalent_nonzero_users: 0,
    users_with_no_legacy_or_assignments: 0,
    users_requiring_additions: 0,
    users_requiring_removals: 0,
    missing_capabilities: 0,
    extra_capabilities: 0,
    missing_scopes: 0,
    extra_scopes: 0,
    invalid_users: 0,
    invalid_assignments: 0
  };
  const users = [];
  const activeUsers = getUsersData().filter(function(user) {
    return normalizeText(user.status).toLowerCase() === "active" &&
      getNormalizedPersonType(user) === "internal";
  });
  const activeInternalUserIds = {};
  const activeInternalUserIdCounts = {};
  const invalidInternalUserIds = {};
  const assignmentRowsByUser = {};
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");

  summary.active_internal_users = activeUsers.length;
  activeUsers.forEach(function(user) {
    const internalUserId = normalizeText(user.internal_user_id);
    if (!internalUserId) {
      summary.invalid_users += 1;
      return;
    }
    activeInternalUserIdCounts[internalUserId] =
      (activeInternalUserIdCounts[internalUserId] || 0) + 1;
  });
  Object.keys(activeInternalUserIdCounts).forEach(function(internalUserId) {
    const count = activeInternalUserIdCounts[internalUserId];
    if (count > 1) {
      summary.invalid_users += count;
      invalidInternalUserIds[internalUserId] = true;
      return;
    }
    activeInternalUserIds[internalUserId] = true;
  });

  getPermissionAssignmentRows_().forEach(function(item) {
    if (normalizeText(item.status).toLowerCase() !== "active") return;
    const internalUserId = normalizeText(item.internal_user_id);
    if (!internalUserId) {
      summary.invalid_assignments += 1;
      return;
    }
    let dates;
    try {
      validatePermissionAssignment_(item);
      dates = validatePermissionAssignmentDates_(item);
    } catch (error) {
      summary.invalid_assignments += 1;
      return;
    }
    if ((dates.valid_from && dates.valid_from > today) ||
        (dates.valid_to && dates.valid_to < today)) {
      return;
    }
    if (!activeInternalUserIds[internalUserId]) {
      summary.invalid_assignments += 1;
      return;
    }
    if (!assignmentRowsByUser[internalUserId]) assignmentRowsByUser[internalUserId] = [];
    assignmentRowsByUser[internalUserId].push(item);
  });

  activeUsers.forEach(function(user) {
    const internalUserId = normalizeText(user.internal_user_id);
    if (!internalUserId || invalidInternalUserIds[internalUserId]) {
      users.push({
        internal_user_id: internalUserId,
        invalid: true,
        classification: "invalid_user",
        modules: []
      });
      return;
    }
    const legacyModules = buildLegacyAuthorizationModules_(user);
    const managedLegacyModules = {};
    AUTHORIZATION_SHADOW_MODULE_CODES.forEach(function(moduleCode) {
      if (legacyModules[moduleCode]) managedLegacyModules[moduleCode] = legacyModules[moduleCode];
    });
    if (Object.keys(managedLegacyModules).length) summary.users_with_legacy_access += 1;

    const assignments = assignmentRowsByUser[internalUserId] || [];
    let assignedModules;
    try {
      assignedModules = buildAssignedAuthorizationModules_(assignments);
    } catch (error) {
      summary.invalid_users += 1;
      users.push({
        internal_user_id: internalUserId,
        invalid: true,
        classification: "invalid_user",
        modules: []
      });
      return;
    }

    const hasManagedAssignments = Object.keys(assignedModules).some(function(moduleCode) {
      return AUTHORIZATION_SHADOW_MODULE_CODES.indexOf(moduleCode) !== -1;
    });
    if (hasManagedAssignments) summary.users_with_active_managed_assignments += 1;
    const moduleCodes = {};
    Object.keys(managedLegacyModules).forEach(function(moduleCode) { moduleCodes[moduleCode] = true; });
    Object.keys(assignedModules).forEach(function(moduleCode) {
      if (AUTHORIZATION_SHADOW_MODULE_CODES.indexOf(moduleCode) !== -1) moduleCodes[moduleCode] = true;
    });

    const modules = Object.keys(moduleCodes).sort().map(function(moduleCode) {
      const legacyCapabilities = managedLegacyModules[moduleCode]
        ? managedLegacyModules[moduleCode].capabilities : [];
      const assignedCapabilities = assignedModules[moduleCode]
        ? assignedModules[moduleCode].capabilities : [];
      const legacyScopes = authorizationScopeKeys_(managedLegacyModules[moduleCode]);
      const assignedScopes = authorizationScopeKeys_(assignedModules[moduleCode]);
      return {
        module_code: moduleCode,
        missing_capabilities: legacyCapabilities.filter(function(capability) {
          return assignedCapabilities.indexOf(capability) === -1;
        }),
        extra_capabilities: assignedCapabilities.filter(function(capability) {
          return legacyCapabilities.indexOf(capability) === -1;
        }),
        missing_scopes: legacyScopes.filter(function(scope) {
          return assignedScopes.indexOf(scope) === -1;
        }),
        extra_scopes: assignedScopes.filter(function(scope) {
          return legacyScopes.indexOf(scope) === -1;
        })
      };
    }).filter(function(module) {
      return module.missing_capabilities.length || module.extra_capabilities.length ||
        module.missing_scopes.length || module.extra_scopes.length;
    });

    const missingCapabilities = modules.reduce(function(total, module) {
      return total + module.missing_capabilities.length;
    }, 0);
    const extraCapabilities = modules.reduce(function(total, module) {
      return total + module.extra_capabilities.length;
    }, 0);
    const missingScopes = modules.reduce(function(total, module) {
      return total + module.missing_scopes.length;
    }, 0);
    const extraScopes = modules.reduce(function(total, module) {
      return total + module.extra_scopes.length;
    }, 0);

    summary.missing_capabilities += missingCapabilities;
    summary.extra_capabilities += extraCapabilities;
    summary.missing_scopes += missingScopes;
    summary.extra_scopes += extraScopes;
    if (missingCapabilities || missingScopes) summary.users_requiring_additions += 1;
    if (extraCapabilities || extraScopes) summary.users_requiring_removals += 1;
    let classification = "differences";
    if (!modules.length) {
      summary.equivalent_users += 1;
      if (!Object.keys(managedLegacyModules).length && !hasManagedAssignments) {
        summary.users_with_no_legacy_or_assignments += 1;
        classification = "no_legacy_or_assignments";
      } else {
        summary.equivalent_nonzero_users += 1;
        classification = "equivalent_nonzero";
      }
    }
    users.push({
      internal_user_id: internalUserId,
      invalid: false,
      classification: classification,
      modules: modules
    });
  });

  summary.ok = summary.invalid_users === 0 &&
    summary.invalid_assignments === 0 &&
    summary.users_requiring_additions === 0 &&
    summary.users_requiring_removals === 0;
  return { summary: summary, users: users };
}

function normalizeAuthorizationCutoverUserIds_(value) {
  const seen = {};
  return normalizeText(value).split(",").map(normalizeText).filter(function(userId) {
    if (!userId || seen[userId]) return false;
    seen[userId] = true;
    return true;
  });
}

function runAuthorizationEffectiveCutover() {
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw authorizationCutoverError_("AUTHORIZATION_CUTOVER_LOCK_TIMEOUT");
  }
  const eventId = "ACE-" + Utilities.getUuid();
  let actor = null;
  let reason = "";
  let startedLogged = false;
  let effectiveReached = false;
  try {
    if (normalizeText(properties.getProperty(
      AUTHORIZATION_CUTOVER_ENABLED_PROPERTY
    )).toLowerCase() !== "true") {
      throw authorizationCutoverError_("AUTHORIZATION_CUTOVER_NOT_APPROVED");
    }
    const actorId = normalizeText(properties.getProperty(
      AUTHORIZATION_CUTOVER_ACTOR_ID_PROPERTY
    ));
    reason = normalizeText(properties.getProperty(
      AUTHORIZATION_CUTOVER_REASON_PROPERTY
    ));
    actor = assertAuthorizationCutoverActor_(actorId, reason);
    if (resolveAuthorizationEnforcementMode_() !== "shadow") {
      throw authorizationCutoverError_("AUTHORIZATION_CUTOVER_ALREADY_EFFECTIVE");
    }
    const preview = previewAuthorizationEffectiveCutover();
    if (!preview.ok) {
      const error = authorizationCutoverError_("AUTHORIZATION_CUTOVER_NOT_READY");
      error.details = preview;
      throw error;
    }
    runAuthorizationIntegrityAudit();
    properties.setProperty(AUTHORIZATION_CUTOVER_ENABLED_PROPERTY, "false");
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: "authorization.effective.cutover",
      actor_internal_user_id: actor.internal_user_id,
      before: { mode: "shadow" },
      after: { mode: "effective" },
      reason: reason,
      result: "started",
      source: "authorization_cutover"
    });
    startedLogged = true;
    properties.setProperty(AUTHORIZATION_ENFORCEMENT_MODE_PROPERTY, "effective");
    effectiveReached = true;
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: "authorization.effective.cutover",
      actor_internal_user_id: actor.internal_user_id,
      before: { mode: "shadow" },
      after: { mode: "effective" },
      reason: reason,
      result: "success",
      source: "authorization_cutover"
    });
    properties.deleteProperty(AUTHORIZATION_CUTOVER_ACTOR_ID_PROPERTY);
    properties.deleteProperty(AUTHORIZATION_CUTOVER_REASON_PROPERTY);
    properties.deleteProperty(AUTHORIZATION_CUTOVER_MIGRATED_USER_IDS_PROPERTY);
    return { ok: true, mode: "effective", authorization_event_id: eventId };
  } catch (error) {
    let rollbackError = null;
    if (effectiveReached) {
      try {
        properties.setProperty(AUTHORIZATION_ENFORCEMENT_MODE_PROPERTY, "shadow");
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError;
      }
    }
    if (startedLogged) {
      try {
        appendAuthorizationChangeLog_({
          authorization_event_id: eventId,
          event_type: "authorization.effective.cutover",
          actor_internal_user_id: actor.internal_user_id,
          before: { mode: effectiveReached ? "effective" : "shadow" },
          after: rollbackError ? {
            mode: "effective",
            original_error_code: normalizeText(error.code || error.message),
            rollback_error_code: normalizeText(rollbackError.code || rollbackError.message)
          } : { mode: "shadow" },
          reason: reason,
          result: rollbackError ? "recovery_required" : "error",
          error_code: rollbackError
            ? "AUTHORIZATION_CUTOVER_RECOVERY_REQUIRED"
            : normalizeText(error.code || error.message),
          source: "authorization_cutover"
        });
      } catch (logError) {
        console.error("Authorization cutover rollback logging failed", logError);
      }
    }
    if (rollbackError) {
      const recoveryError = authorizationCutoverError_(
        "AUTHORIZATION_CUTOVER_RECOVERY_REQUIRED"
      );
      recoveryError.original_error_code = normalizeText(error.code || error.message);
      recoveryError.rollback_error_code = normalizeText(
        rollbackError.code || rollbackError.message
      );
      throw recoveryError;
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function runAuthorizationEffectiveRollback() {
  const properties = PropertiesService.getScriptProperties();
  const actorId = normalizeText(properties.getProperty(
    AUTHORIZATION_CUTOVER_ACTOR_ID_PROPERTY
  ));
  const reason = normalizeText(properties.getProperty(
    AUTHORIZATION_CUTOVER_REASON_PROPERTY
  ));
  const actor = assertAuthorizationCutoverActor_(actorId, reason);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw authorizationCutoverError_("AUTHORIZATION_CUTOVER_LOCK_TIMEOUT");
  }
  try {
    const beforeMode = resolveAuthorizationEnforcementMode_();
    properties.setProperty(AUTHORIZATION_ENFORCEMENT_MODE_PROPERTY, "shadow");
    appendAuthorizationChangeLog_({
      authorization_event_id: "ACE-" + Utilities.getUuid(),
      event_type: "authorization.effective.rollback",
      actor_internal_user_id: actor.internal_user_id,
      before: { mode: beforeMode },
      after: { mode: "shadow" },
      reason: reason,
      result: "success",
      source: "authorization_cutover"
    });
    return { ok: true, mode: "shadow" };
  } finally {
    lock.releaseLock();
  }
}

function assertAuthorizationCutoverActor_(actorId, reason) {
  const activeEmail = normalizeAccountConsoleEmail_(Session.getActiveUser().getEmail());
  const actor = getUsersData().find(function(user) {
    return normalizeText(user.internal_user_id) === normalizeText(actorId);
  });
  if (!actor || !normalizeText(reason) || !activeEmail ||
      normalizeAccountConsoleEmail_(actor.email) !== activeEmail ||
      normalizeText(actor.status).toLowerCase() !== "active" ||
      getNormalizedPersonType(actor) !== "internal" ||
      normalizeText(actor.role).toLowerCase() !== "developer") {
    throw authorizationCutoverError_("AUTHORIZATION_CUTOVER_ACTOR_INVALID");
  }
  return actor;
}

function authorizationCutoverError_(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function findAuthorizationOrganizationUser_(user) {
  const userId = normalizeText(user.internal_user_id || user.userId);
  if (!userId) {
    return user;
  }

  try {
    return getUsersData().find(function(item) {
      return normalizeText(item.internal_user_id) === userId;
    }) || user;
  } catch (error) {
    console.error("Organization source user resolution failed", error);
    return user;
  }
}

function buildAuthorizationPublicUser_(user, organizationUser) {
  const source = organizationUser || user;
  return {
    internal_user_id: normalizeText(user.internal_user_id || user.userId),
    status: normalizeText(user.status),
    role: normalizeText(user.role),
    organization_id: normalizeText(user.organization_id),
    organization_level: normalizeOrganizationLevel_(source.organization_level),
    base_area: normalizeText(user.base_area),
    allowed_modules: Array.isArray(user.allowed_modules)
      ? user.allowed_modules.map(normalizeText).filter(Boolean)
      : parseAllowedModules(user.allowed_modules)
  };
}

function buildAssignedAuthorizationModules_(assignments) {
  const modules = {};

  assignments.forEach(function(rawItem) {
    const item = validatePermissionAssignment_(rawItem);
    const moduleCode = item.module_code;

    if (!modules[moduleCode]) {
      modules[moduleCode] = {
        capabilities: [],
        scopes: []
      };
    }

    if (modules[moduleCode].capabilities.indexOf(item.capability_code) === -1) {
      modules[moduleCode].capabilities.push(item.capability_code);
    }

    const scope = {
      type: item.scope_type,
      value: item.scope_value
    };
    const scopeKey = scope.type + "\u001f" + scope.value;
    const exists = modules[moduleCode].scopes.some(function(existing) {
      return existing.type + "\u001f" + existing.value === scopeKey;
    });

    if (!exists) {
      modules[moduleCode].scopes.push(scope);
    }
  });

  sortAuthorizationModules_(modules);
  return modules;
}

function buildLegacyAuthorizationModules_(user) {
  const modules = {};
  const developer = normalizeText(user.role).toLowerCase() === "developer";
  const allowedModules = (Array.isArray(user.allowed_modules)
    ? user.allowed_modules.map(normalizeText).filter(Boolean)
    : parseAllowedModules(user.allowed_modules)
  ).map(function(moduleCode) {
    return moduleCode.toLowerCase();
  });

  if (developer) {
    ["account_console", "pmo", "ordercase", "shift"].forEach(function(moduleCode) {
      if (allowedModules.indexOf(moduleCode) === -1) allowedModules.push(moduleCode);
    });
  }

  if (allowedModules.indexOf("account_console") !== -1) {
    modules.account_console = legacyAuthorizationModule_([
      "account.view",
      "account.profile.edit",
      "account.permission.edit",
      "account.status.edit",
      "account.signup.review",
      "audit.view"
    ]);
  }

  if (allowedModules.indexOf("ordercase") !== -1) {
    const orderCasePermission = developer ? "all" : normalizeText(user.ordercase_permission);
    const orderCaseCapabilities = {
      all: [
        "ordercase.view",
        "ordercase.amount.view",
        "ordercase.case.create",
        "ordercase.case.edit",
        "ordercase.amount.edit",
        "ordercase.rank.edit",
        "ordercase.store.edit",
        "ordercase.case.archive",
        "ordercase.store.archive"
      ],
      edit: [
        "ordercase.view",
        "ordercase.amount.view",
        "ordercase.case.create",
        "ordercase.case.edit",
        "ordercase.amount.edit",
        "ordercase.store.edit",
        "ordercase.case.archive",
        "ordercase.store.archive"
      ],
      view: ["ordercase.view", "ordercase.amount.view"],
      view_without_amount: ["ordercase.view"]
    }[orderCasePermission];

    if (orderCaseCapabilities) {
      modules.ordercase = legacyAuthorizationModule_(orderCaseCapabilities);
    }
  }

  if (allowedModules.indexOf("shift") !== -1) {
    const shiftPermission = developer ? "all" : normalizeText(user.shiftbuilder_permission);
    const shiftCapabilities = {
      all: ["shift.view.all", "shift.draft.edit", "shift.distribute"],
      manager: ["shift.view.all", "shift.draft.edit", "shift.distribute"],
      edit: ["shift.view.all", "shift.draft.edit", "shift.distribute"],
      view: ["shift.view.all"],
      self: ["shift.view.all"]
    }[shiftPermission];

    if (shiftCapabilities) {
      modules.shift = legacyAuthorizationModule_(shiftCapabilities);
    }
  }

  sortAuthorizationModules_(modules);
  return modules;
}

function isAuthorizationShadowEnabled_() {
  const value = normalizeText(
    PropertiesService.getScriptProperties().getProperty(
      AUTHORIZATION_SHADOW_ENABLED_PROPERTY
    )
  ).toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

function legacyAuthorizationModule_(capabilities, scopeType) {
  return {
    capabilities: capabilities.slice().sort(),
    scopes: [{ type: scopeType || "all", value: "" }]
  };
}

function sortAuthorizationModules_(modules) {
  Object.keys(modules).forEach(function(moduleCode) {
    modules[moduleCode].capabilities.sort();
    modules[moduleCode].scopes.sort(function(a, b) {
      return (a.type + "\u001f" + a.value).localeCompare(b.type + "\u001f" + b.value);
    });
  });
}

function compareAuthorizationModules_(legacyModules, assignedModules) {
  const moduleCodes = Object.keys(assignedModules).sort();

  return moduleCodes.map(function(moduleCode) {
    if (AUTHORIZATION_SHADOW_MODULE_CODES.indexOf(moduleCode) === -1) {
      return null;
    }

    const legacyCapabilities = legacyModules[moduleCode]
      ? legacyModules[moduleCode].capabilities
      : [];
    const assignedCapabilities = assignedModules[moduleCode]
      ? assignedModules[moduleCode].capabilities
      : [];
    const legacyOnly = legacyCapabilities.filter(function(capability) {
      return assignedCapabilities.indexOf(capability) === -1;
    });
    const assignedOnly = assignedCapabilities.filter(function(capability) {
      return legacyCapabilities.indexOf(capability) === -1;
    });
    const legacyScopes = authorizationScopeKeys_(legacyModules[moduleCode]);
    const assignedScopes = authorizationScopeKeys_(assignedModules[moduleCode]);
    const legacyOnlyScopes = legacyScopes.filter(function(scope) {
      return assignedScopes.indexOf(scope) === -1;
    });
    const assignedOnlyScopes = assignedScopes.filter(function(scope) {
      return legacyScopes.indexOf(scope) === -1;
    });

    if (!legacyOnly.length && !assignedOnly.length &&
        !legacyOnlyScopes.length && !assignedOnlyScopes.length) {
      return null;
    }

    return {
      module_code: moduleCode,
      legacy_capabilities: legacyCapabilities,
      assigned_capabilities: assignedCapabilities,
      legacy_only_capabilities: legacyOnly,
      assigned_only_capabilities: assignedOnly,
      legacy_scopes: legacyScopes,
      assigned_scopes: assignedScopes,
      legacy_only_scopes: legacyOnlyScopes,
      assigned_only_scopes: assignedOnlyScopes
    };
  }).filter(Boolean);
}

function authorizationScopeKeys_(module) {
  return module && Array.isArray(module.scopes)
    ? module.scopes.map(function(scope) {
        return normalizeText(scope.type) + ":" + normalizeText(scope.value);
      }).sort()
    : [];
}

function appendAuthorizationShadowDifferences_(sheet, internalUserId, differences) {
  if (!sheet) {
    console.error("Authorization Shadow log sheet is unavailable");
    return false;
  }

  if (!differences.length) {
    return true;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error("Authorization Shadow log lock timeout");
  }

  try {
    const values = sheet.getDataRange().getDisplayValues();
    const logIndex = buildAuthorizationShadowLogIndex_(values);
    const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");

    differences.forEach(function(item) {
      if (hasAuthorizationShadowLogToday_(logIndex, today, internalUserId, item)) {
        return;
      }

      sheet.appendRow([
        "ASL-" + Utilities.getUuid(),
        today,
        getNowIsoStringJst(),
        escapeAuthorizationSheetText_(internalUserId),
        escapeAuthorizationSheetText_(item.module_code),
        escapeAuthorizationSheetText_(item.legacy_capabilities.join(",")),
        escapeAuthorizationSheetText_(item.assigned_capabilities.join(",")),
        escapeAuthorizationSheetText_(item.legacy_only_capabilities.join(",")),
        escapeAuthorizationSheetText_(item.assigned_only_capabilities.join(",")),
        escapeAuthorizationSheetText_(item.legacy_scopes.join(",")),
        escapeAuthorizationSheetText_(item.assigned_scopes.join(",")),
        escapeAuthorizationSheetText_(item.legacy_only_scopes.join(",")),
        escapeAuthorizationSheetText_(item.assigned_only_scopes.join(","))
      ]);
      logIndex[authorizationShadowLogKey_(today, internalUserId, item)] = true;
    });
  } finally {
    lock.releaseLock();
  }

  return true;
}

function buildAuthorizationShadowLogIndex_(values) {
  const result = {};
  if (values.length < 2) {
    return result;
  }

  const headers = values[0].map(normalizeText);
  const indexes = {
    checkedDate: headers.indexOf("checked_date"),
    userId: headers.indexOf("internal_user_id"),
    moduleCode: headers.indexOf("module_code"),
    legacyOnly: headers.indexOf("legacy_only_capabilities"),
    assignedOnly: headers.indexOf("assigned_only_capabilities"),
    legacyOnlyScopes: headers.indexOf("legacy_only_scopes"),
    assignedOnlyScopes: headers.indexOf("assigned_only_scopes")
  };

  if (Object.keys(indexes).some(function(key) { return indexes[key] < 0; })) {
    throw new Error(AUTHORIZATION_SHADOW_LOGS_SHEET_NAME + " の見出しが不足しています");
  }

  values.slice(1).forEach(function(row) {
    const item = {
      module_code: normalizeText(row[indexes.moduleCode]),
      legacy_only_capabilities: splitAuthorizationLogList_(row[indexes.legacyOnly]),
      assigned_only_capabilities: splitAuthorizationLogList_(row[indexes.assignedOnly]),
      legacy_only_scopes: splitAuthorizationLogList_(row[indexes.legacyOnlyScopes]),
      assigned_only_scopes: splitAuthorizationLogList_(row[indexes.assignedOnlyScopes])
    };
    result[authorizationShadowLogKey_(
      normalizeText(row[indexes.checkedDate]),
      normalizeText(row[indexes.userId]).replace(/^'/, ""),
      item
    )] = true;
  });
  return result;
}

function hasAuthorizationShadowLogToday_(logIndex, today, internalUserId, item) {
  return Boolean(logIndex[authorizationShadowLogKey_(today, internalUserId, item)]);
}

function authorizationShadowLogKey_(date, internalUserId, item) {
  return [
    normalizeText(date),
    normalizeText(internalUserId).replace(/^'/, ""),
    item.module_code,
    item.legacy_only_capabilities.join(","),
    item.assigned_only_capabilities.join(","),
    item.legacy_only_scopes.join(","),
    item.assigned_only_scopes.join(",")
  ].join("\u001f");
}

function splitAuthorizationLogList_(value) {
  const text = normalizeText(value);
  return text ? text.split(",").map(normalizeText).filter(Boolean) : [];
}

function escapeAuthorizationSheetText_(value) {
  const text = normalizeText(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
// ===== 共通権限コンテキスト ここまで =====
