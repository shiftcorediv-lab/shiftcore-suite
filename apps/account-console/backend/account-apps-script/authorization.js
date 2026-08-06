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
  const legacyModules = buildLegacyAuthorizationModules_(user);
  let assignedModules = {};
  let configured = false;
  let shadowError = false;
  let shadowEnabled = false;

  try {
    shadowEnabled = isAuthorizationShadowEnabled_();
  } catch (error) {
    shadowError = true;
    console.error("Authorization Shadow switch resolution failed", error);
  }

  if (shadowEnabled) {
    try {
      const assignments = getActivePermissionAssignmentsForUser_(user.internal_user_id);
      configured = assignments.length > 0;
      assignedModules = configured
        ? buildAssignedAuthorizationModules_(assignments)
        : {};
    } catch (error) {
      shadowError = true;
      configured = false;
      assignedModules = {};
      console.error("Authorization Shadow candidate resolution failed", error);
    }
  }

  let differences = [];

  if (configured && !shadowError) {
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

  try {
    shadowLogSheet = getAuthorizationShadowLogsSheet_();
    loggingAvailable = Boolean(shadowLogSheet);
  } catch (error) {
    shadowError = true;
    console.error("Authorization Shadow log sheet resolution failed", error);
  }

  if (configured && !shadowError) {
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
    user: buildAuthorizationPublicUser_(user),
    authorization: {
      version: 1,
      mode: "shadow",
      source: configured ? "legacy_shadow" : "legacy",
      legacy_fallback: true,
      modules: legacyModules,
      candidate_modules: configured ? assignedModules : {},
      shadow: {
        enabled: configured,
        healthy: !shadowError,
        logging_available: loggingAvailable,
        differences: differences
      }
    }
  };
}

function buildAuthorizationPublicUser_(user) {
  return {
    internal_user_id: normalizeText(user.internal_user_id || user.userId),
    status: normalizeText(user.status),
    role: normalizeText(user.role),
    organization_id: normalizeText(user.organization_id),
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
  const allowedModules = (Array.isArray(user.allowed_modules)
    ? user.allowed_modules.map(normalizeText).filter(Boolean)
    : parseAllowedModules(user.allowed_modules)
  ).map(function(moduleCode) {
    return moduleCode.toLowerCase();
  });

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
    const orderCasePermission = normalizeText(user.ordercase_permission);
    const orderCaseCapabilities = {
      all: [
        "ordercase.view",
        "ordercase.amount.view",
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
    const shiftPermission = normalizeText(user.shiftbuilder_permission);
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
