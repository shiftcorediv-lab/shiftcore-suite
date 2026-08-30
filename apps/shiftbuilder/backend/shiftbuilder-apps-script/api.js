// ===== ShiftBuilder API ここから =====


// ===== Web App entrypoint ここから =====
function doPost(e) {
  try {
    const body = parseRequestBody_(e);
    const action = normalizeText(body.action);

    if (!action) {
      return createJsonResponse_(ng_("action が必要です", "MISSING_ACTION"));
    }

    let result;

    switch (action) {
      case "shiftBuilderPing":
        result = shiftBuilderPing(body);
        break;


      case "shiftBuilderBootstrap":
        result = shiftBuilderBootstrap(body);
        break;

      case "shiftBuilderGetCurrentUser":
        result = shiftBuilderGetCurrentUser(body);
        break;

      case "shiftBuilderGetMonthData":
        result = shiftBuilderGetMonthData(body);
        break;

      case "shiftBuilderCreateAssignment":
        result = shiftBuilderCreateAssignment(body);
        break;

      case "shiftBuilderArchiveAssignment":
        result = shiftBuilderArchiveAssignment(body);
        break;

      case "shiftBuilderReplaceAssignment":
        result = shiftBuilderReplaceAssignment(body);
        break;

            case "shiftBuilderSendPersonnelIcs":
        result = shiftBuilderSendPersonnelIcs(body);
        break;
case "shiftBuilderGetAssignmentCandidates":
        result = shiftBuilderGetAssignmentCandidates(body);
        break;
    }

    return createJsonResponse_(result);

  } catch (error) {
    return createJsonResponse_(ng_(error.message, "SERVER_ERROR"));
  }
}

function doGet(e) {
  return createJsonResponse_(ok_({
    message: "ShiftBuilder API is running",
    service: "ShiftBuilder_API",
    environment: shiftBuilderRuntimeEnvironment_()
  }));
}
// ===== Web App entrypoint ここまで =====


// ===== 初期表示統合ここから =====
function shiftBuilderBootstrap(body) {
  const idToken = normalizeText(body.idToken);
  const targetMonth = normalizeMonth(body.targetMonth);
  const area = normalizeText(body.area) || "all";

  if (!idToken) {
    throw new Error("idToken が必要です");
  }

  if (!targetMonth) {
    throw new Error("targetMonth が必要です");
  }

  const tokenResult = resolveFirebaseEmailByIdTokenCached_(idToken);

  if (!tokenResult.ok) {
    throw new Error(tokenResult.message || "ログインユーザーを確認できません");
  }

  const users = getUsersMasterRows_();
  const targetEmail = normalizeLowerText(tokenResult.email);
  const operator = users.find(function(user) {
    return normalizeLowerText(user.email) === targetEmail;
  });

  requireShiftBuilderUser_(operator);

  const data = buildShiftBuilderMonthData_(targetMonth, area);
  const candidates = buildShiftBuilderCandidatesFromUsers_(users, targetMonth, area);

  return ok_({
    user: buildShiftBuilderUser_(operator),
    canUseShiftBuilder: true,
    canEditShiftBuilder: canEditShiftBuilder_(operator),
    target_month: targetMonth,
    area: area,
    data: data,
    candidates: candidates
  });
}

function resolveFirebaseEmailByIdTokenCached_(idToken) {
  const cache = CacheService.getScriptCache();
  const digestBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizeText(idToken)
  );
  const digest = digestBytes.map(function(value) {
    return ("0" + (value & 255).toString(16)).slice(-2);
  }).join("");
  const cacheKey = "firebase-email:" + digest;
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      cache.remove(cacheKey);
    }
  }

  const result = resolveFirebaseEmailByIdToken_(idToken);

  if (result && result.ok === true) {
    cache.put(cacheKey, JSON.stringify(result), 300);
  }

  return result;
}

function buildShiftBuilderCandidatesFromUsers_(users, targetMonth, area) {
  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedArea = normalizeText(area) || "all";

  return users
    .filter(function(user) {
      return normalizeLowerText(user.status) === "active";
    })
    .filter(function(user) {
      return normalizeLowerText(user.role) !== "developer";
    })
    .filter(function(user) {
      return includesCsvValue(user.allowed_modules, SHIFTBUILDER_MODULE_KEY);
    })
    .filter(function(user) {
      const engagementStatus = normalizeLowerText(user.engagement_status);
      return !engagementStatus || engagementStatus === "active";
    })
    .map(function(user) {
      const displayName =
        normalizeText(user.display_name) ||
        normalizeText(user.name) ||
        normalizeText(user.email) ||
        normalizeText(user.internal_user_id) ||
        "氏名未設定";

      return {
        internal_user_id: normalizeText(user.internal_user_id),
        account_code: normalizeText(user.employee_code || user.account_code),
        employee_code: normalizeText(user.employee_code),
        display_name: displayName,
        displayName: displayName,
        name: displayName,
        email: normalizeLowerText(user.email),
        role: normalizeText(user.role),
        organization_id: normalizeText(user.organization_id),
        department: normalizeText(user.department),
        position: normalizeText(user.position),
        base_area: normalizeText(user.base_area),
        person_type: normalizeText(user.person_type),
        contract_type: normalizeText(user.contract_type),
        engagement_status: normalizeText(user.engagement_status),
        shiftbuilder_permission: normalizeText(user.shiftbuilder_permission),
        target_month: normalizedTargetMonth,
        area: normalizedArea
      };
    })
    .filter(function(candidate) {
      return candidate.internal_user_id;
    })
    .sort(function(a, b) {
      const aKey = a.display_name || a.internal_user_id;
      const bKey = b.display_name || b.internal_user_id;
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
}
// ===== 初期表示統合ここまで =====


// ===== request / response ここから =====
function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const text = e.postData.contents;

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("リクエストJSONの解析に失敗しました: " + error.message);
  }
}

function createJsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
// ===== request / response ここまで =====


// ===== ShiftBuilder API ここまで =====
