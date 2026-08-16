// ===== 組織階層Shadow判定 ここから =====

function resolveOrganizationShadowContext_(currentUser) {
  try {
    if (!isOrganizationShadowEnabled_()) {
      return {
        enabled: false,
        configured: false,
        healthy: true,
        organization_level: "",
        organization_version: 0,
        errors: []
      };
    }
  } catch (error) {
    console.error("Organization Shadow switch resolution failed", error);
    return {
      enabled: false,
      configured: false,
      healthy: false,
      organization_level: "",
      organization_version: 0,
      errors: [{ code: "ORGANIZATION_SHADOW_SWITCH_FAILED" }]
    };
  }

  const result = buildOrganizationShadowContext_(currentUser);
  result.enabled = true;
  return result;
}

function isOrganizationShadowEnabled_() {
  const value = normalizeText(
    PropertiesService.getScriptProperties().getProperty(
      ORGANIZATION_SHADOW_ENABLED_PROPERTY
    )
  ).toLowerCase();
  return value === "true" || value === "1" || value === "on";
}

function buildOrganizationShadowContext_(currentUser) {
  const level = normalizeOrganizationLevel_(currentUser.organization_level);

  if (!level) {
    return {
      configured: false,
      healthy: true,
      organization_level: "",
      organization_version: 0,
      errors: []
    };
  }

  try {
    const users = getUsersData();
    const validation = validateOrganizationGraph_(users);
    const userId = normalizeText(currentUser.internal_user_id || currentUser.userId);
    const currentErrors = validation.errors.filter(function(item) {
      return item.internal_user_id === userId;
    });

    return {
      configured: true,
      healthy: currentErrors.length === 0,
      organization_level: level,
      organization_version: normalizeOrganizationVersion_(currentUser.organization_version),
      errors: currentErrors.map(function(item) { return { code: item.code }; })
    };
  } catch (error) {
    console.error("Organization Shadow resolution failed", error);
    return {
      configured: true,
      healthy: false,
      organization_level: level,
      organization_version: 0,
      errors: [{ code: "ORGANIZATION_SHADOW_FAILED" }]
    };
  }
}

function normalizeOrganizationLevel_(value) {
  const level = normalizeText(value).toLowerCase();
  return ORGANIZATION_LEVELS.indexOf(level) === -1 ? "" : level;
}

function normalizeOrganizationVersion_(value) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 0;
}

function validateOrganizationGraph_(rawUsers) {
  const users = Array.isArray(rawUsers) ? rawUsers : [];
  const byId = {};
  const errors = [];

  users.forEach(function(user) {
    const userId = normalizeText(user.internal_user_id || user.userId);
    if (userId) {
      byId[userId] = user;
    }
  });

  Object.keys(byId).forEach(function(userId) {
    const user = byId[userId];
    const level = normalizeOrganizationLevel_(user.organization_level);
    if (!level) {
      return;
    }

    const managerId = normalizeText(user.direct_manager_user_id);
    const reviewerId = normalizeText(user.executive_reviewer_user_id);

    if (level === "executive") {
      if (managerId) {
        errors.push(organizationError_(userId, "DIRECT_MANAGER_INVALID"));
      }
      validateExecutiveReviewer_(userId, reviewerId, byId, errors);
      return;
    }

    validateDirectManager_(userId, level, managerId, byId, errors);
    if (reviewerId) {
      errors.push(organizationError_(userId, "EXECUTIVE_REVIEWER_FORBIDDEN"));
    }
  });

  detectOrganizationCycles_(byId, errors);
  validateExecutiveReviewerGraph_(byId, errors);
  return { healthy: errors.length === 0, errors: errors };
}

function validateDirectManager_(userId, level, managerId, byId, errors) {
  const expectedLevel = {
    member: "leader",
    leader: "manager",
    manager: "executive"
  }[level];
  const manager = byId[managerId];

  if (!managerId || managerId === userId || !manager ||
      normalizeText(manager.status).toLowerCase() !== "active" ||
      normalizeOrganizationLevel_(manager.organization_level) !== expectedLevel) {
    errors.push(organizationError_(userId, "DIRECT_MANAGER_INVALID"));
  }
}

function validateExecutiveReviewer_(userId, reviewerId, byId, errors) {
  const reviewer = byId[reviewerId];
  if (!reviewerId || reviewerId === userId || !reviewer ||
      normalizeText(reviewer.status).toLowerCase() !== "active" ||
      normalizeOrganizationLevel_(reviewer.organization_level) !== "executive") {
    errors.push(organizationError_(userId, "EXECUTIVE_REVIEWER_INVALID"));
  }
}

function validateExecutiveReviewerGraph_(byId, errors) {
  const executiveIds = Object.keys(byId).filter(function(userId) {
    const user = byId[userId];
    return normalizeText(user.status).toLowerCase() === "active" &&
      normalizeOrganizationLevel_(user.organization_level) === "executive";
  });
  if (executiveIds.length < 2) return;

  const incomingCounts = {};
  executiveIds.forEach(function(userId) { incomingCounts[userId] = 0; });
  executiveIds.forEach(function(userId) {
    const reviewerId = normalizeText(byId[userId].executive_reviewer_user_id);
    if (Object.prototype.hasOwnProperty.call(incomingCounts, reviewerId)) {
      incomingCounts[reviewerId] += 1;
    }
  });

  const visited = {};
  let currentId = executiveIds[0];
  while (currentId && !visited[currentId] && byId[currentId]) {
    visited[currentId] = true;
    currentId = normalizeText(byId[currentId].executive_reviewer_user_id);
  }

  const isSingleClosedCycle = currentId === executiveIds[0] &&
    Object.keys(visited).length === executiveIds.length &&
    executiveIds.every(function(userId) { return incomingCounts[userId] === 1; });
  if (isSingleClosedCycle) return;

  executiveIds.forEach(function(userId) {
    errors.push(organizationError_(userId, "EXECUTIVE_REVIEWER_GRAPH_INVALID"));
  });
}

function detectOrganizationCycles_(byId, errors) {
  Object.keys(byId).forEach(function(startId) {
    const visited = {};
    let currentId = startId;

    while (currentId && byId[currentId]) {
      if (visited[currentId]) {
        errors.push(organizationError_(startId, "ORGANIZATION_CYCLE"));
        return;
      }
      visited[currentId] = true;
      currentId = normalizeText(byId[currentId].direct_manager_user_id);
    }
  });
}

function organizationError_(userId, code) {
  return {
    internal_user_id: normalizeText(userId),
    code: normalizeText(code)
  };
}

function assertApprovalReviewer_(requester, reviewer) {
  const requesterId = normalizeText(requester && requester.internal_user_id);
  const reviewerId = normalizeText(reviewer && reviewer.internal_user_id);

  if (!requesterId || !reviewerId ||
      normalizeText(requester.status).toLowerCase() !== "active" ||
      normalizeText(reviewer.status).toLowerCase() !== "active") {
    throw organizationAuthorizationError_("REVIEWER_MISMATCH");
  }
  if (requesterId === reviewerId) {
    throw organizationAuthorizationError_("SELF_APPROVAL_FORBIDDEN");
  }

  const requesterLevel = normalizeOrganizationLevel_(requester.organization_level);
  const expectedReviewerId = requesterLevel === "executive"
    ? normalizeText(requester.executive_reviewer_user_id)
    : normalizeText(requester.direct_manager_user_id);

  if (!requesterLevel || expectedReviewerId !== reviewerId) {
    throw organizationAuthorizationError_("REVIEWER_MISMATCH");
  }

  const reviewerLevel = normalizeOrganizationLevel_(reviewer.organization_level);
  const expectedReviewerLevel = requesterLevel === "executive"
    ? "executive"
    : { member: "leader", leader: "manager", manager: "executive" }[requesterLevel];

  if (reviewerLevel !== expectedReviewerLevel) {
    throw organizationAuthorizationError_("REVIEWER_MISMATCH");
  }

  return true;
}

function organizationAuthorizationError_(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// ===== 組織階層Shadow判定 ここまで =====
