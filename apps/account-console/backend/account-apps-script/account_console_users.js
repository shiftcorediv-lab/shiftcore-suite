// ===== Account Console ユーザー管理ここから =====


// ===== 現在ユーザー取得ここから =====
function accountConsoleGetCurrentUser(body) {
  const operator = requireAccountConsoleOperator_(body);

  return {
    success: true,
    ok: true,
    user: operator,
    canUseAccountConsole: true,
    canEditUsers: isAccountConsoleEditor_(operator)
  };
}
// ===== 現在ユーザー取得ここまで =====


// ===== 初期表示データ取得ここから =====
function accountConsoleGetBootstrap(body) {
  const operator = requireAccountConsoleOperator_(body);

  ensureAccountConsoleNameColumns_();

  const users = getUsersData()
    .map(function(user) {
      return buildAccountConsoleUser_(user);
    })
    .filter(function(user) {
      return shouldIncludeAccountConsoleUser_(operator, user);
    });

  const logsResult = accountConsoleGetLogs(body);

  return {
    success: true,
    ok: true,
    user: operator,
    users: users,
    logs: logsResult.logs || [],
    canUseAccountConsole: true,
    canEditUsers: isAccountConsoleEditor_(operator)
  };
}
// ===== 初期表示データ取得ここまで =====




// ===== ユーザー一覧取得ここから =====
function accountConsoleListUsers(body) {
  const operator = requireAccountConsoleOperator_(body);

  ensureAccountConsoleNameColumns_();

  const users = getUsersData()
    .map(function(user) {
      return buildAccountConsoleUser_(user);
    })
    .filter(function(user) {
      return shouldIncludeAccountConsoleUser_(operator, user);
    });

  return {
    success: true,
    ok: true,
    users: users
  };
}
// ===== ユーザー一覧取得ここまで =====

function shouldIncludeAccountConsoleUser_(operator, user) {
  if (normalizeText(user && user.employee_code).toUpperCase() !== "AN0000") {
    return true;
  }
  return normalizeText(operator && operator.role).toLowerCase() === "developer" &&
    normalizeText(operator && operator.internal_user_id) ===
      normalizeText(user && user.internal_user_id);
}


// ===== ユーザー新規作成ここから =====
function accountConsoleCreateUser(body) {
  const operator = requireAccountConsoleEditor_(body);
  const payload = body.payload || body.user || {};

  validateAccountConsoleUserPayload_(payload, true);
  assertDeveloperAccountMutationAllowed_(operator, "", payload.role, "");

  const sheet = ensureAccountConsoleNameColumns_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(header) {
    return normalizeText(header);
  });

  const email = normalizeAccountConsoleEmail_(payload.email);

  if (findUserByEmail(email)) {
    return {
      success: false,
      ok: false,
      code: "EMAIL_ALREADY_EXISTS",
      message: "このメールアドレスはすでに登録されています"
    };
  }

  const now = getNowIsoStringJst();
  const newUser = {};

  headers.forEach(function(header) {
    newUser[header] = "";
  });

  const normalizedPersonType = normalizeText(payload.person_type || "internal");
  const normalizedContractType = normalizeText(payload.contract_type || "none");
  const normalizedAffiliationType = normalizeText(
    payload.affiliation_type ||
    inferAffiliationTypeFromPersonType_(normalizedPersonType)
  );
  const normalizedGradeRole = normalizeText(payload.grade_role);
  const normalizedEngagementStatus = normalizeText(
    payload.engagement_status ||
    convertWorkStatusToEngagementStatus_(payload.workStatus || payload.work_status || "off")
  );

  const normalizedOrganizationId = normalizedPersonType === "internal"
    ? "internal"
    : normalizeText(payload.organization_id);

  setIfHeaderExists_(newUser, headers, "internal_user_id", generateInternalUserId_());
  setIfHeaderExists_(newUser, headers, "auth_provider", normalizeText(payload.auth_provider));
  setIfHeaderExists_(newUser, headers, "auth_uid", normalizeText(payload.auth_uid));
  setIfHeaderExists_(newUser, headers, "employee_code", normalizeText(payload.employee_code));
  setIfHeaderExists_(newUser, headers, "email", email);
  setIfHeaderExists_(newUser, headers, "family_name", normalizeText(payload.family_name));
  setIfHeaderExists_(newUser, headers, "given_name", normalizeText(payload.given_name));
  setIfHeaderExists_(newUser, headers, "name", getAccountConsoleFullName_(payload));
  setIfHeaderExists_(newUser, headers, "display_name", normalizeText(payload.display_name));
  setIfHeaderExists_(newUser, headers, "role", normalizeText(payload.role || "member"));
  setIfHeaderExists_(newUser, headers, "organization_id", normalizedOrganizationId);
  setIfHeaderExists_(newUser, headers, "department", normalizeText(payload.department));
  setIfHeaderExists_(newUser, headers, "position", normalizeText(payload.position));
  setIfHeaderExists_(newUser, headers, "base_area", normalizeText(payload.base_area));
  setIfHeaderExists_(newUser, headers, "phone", normalizeText(payload.phone));
  setIfHeaderExists_(newUser, headers, "memo", normalizeText(payload.memo));
  setIfHeaderExists_(newUser, headers, "status", normalizeText(payload.status || "active"));
  setIfHeaderExists_(newUser, headers, "workStatus", normalizeText(payload.workStatus || payload.work_status || "off"));
  setIfHeaderExists_(newUser, headers, "sortOrder", normalizeText(payload.sortOrder));
  setIfHeaderExists_(newUser, headers, "allowed_modules", normalizeAccountConsoleModules_(payload.allowed_modules));
  setIfHeaderExists_(newUser, headers, "ordercase_permission", normalizeText(payload.ordercase_permission));
  setIfHeaderExists_(newUser, headers, "shiftbuilder_permission", normalizeText(payload.shiftbuilder_permission));

  // ===== 人員区分・契約区分ここから =====
  setIfHeaderExists_(newUser, headers, "person_type", normalizedPersonType);
  setIfHeaderExists_(newUser, headers, "affiliation_type", normalizedAffiliationType);
  setIfHeaderExists_(newUser, headers, "contract_type", normalizedContractType);
  setIfHeaderExists_(newUser, headers, "grade_role", normalizedGradeRole);
  setIfHeaderExists_(newUser, headers, "engagement_status", normalizedEngagementStatus);
  // ===== 人員区分・契約区分ここまで =====

  setIfHeaderExists_(newUser, headers, "created_at", now);
  setIfHeaderExists_(newUser, headers, "updated_at", now);
  setIfHeaderExists_(newUser, headers, "updated_by", operator.email);

  const developerAuthorizationEventId = beginDeveloperAccountAuthorizationEvent_(
    operator,
    "",
    newUser.role,
    newUser.internal_user_id,
    "Account Consoleでdeveloperアカウントを作成"
  );

  const row = headers.map(function(header) {
    return newUser[header] || "";
  });

  sheet.appendRow(row);
  completeDeveloperAccountAuthorizationEvent_(
    developerAuthorizationEventId,
    operator,
    "",
    newUser.role,
    newUser.internal_user_id,
    "Account Consoleでdeveloperアカウントを作成"
  );

  appendAccountConsoleLog_({
    changedBy: operator.email,
    targetUserId: newUser.internal_user_id || "",
    targetEmail: email,
    field: "create_user",
    beforeValue: "",
    afterValue: JSON.stringify(buildAccountConsoleUser_(newUser)),
    memo: "Account Consoleで新規作成"
  });

  return {
    success: true,
    ok: true,
    message: "ユーザーを作成しました",
    user: buildAccountConsoleUser_(newUser)
  };
}
// ===== ユーザー新規作成ここまで =====


// ===== ユーザー更新ここから =====
function accountConsoleUpdateUser(body) {
  const operator = requireAccountConsoleEditor_(body);
  const payload = body.payload || body.user || {};

  const targetUserId = normalizeText(
    payload.internal_user_id ||
    payload.userId ||
    payload.account_id
  );

  if (!targetUserId) {
    throw new Error("internal_user_id が必要です");
  }

  validateAccountConsoleUserPayload_(payload, false);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("ACCOUNT_CONSOLE_LOCK_TIMEOUT");
  }

  try {

  const sheet = ensureAccountConsoleNameColumns_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(header) {
    return normalizeText(header);
  });

  const userIdIndex = headers.indexOf("internal_user_id");
  if (userIdIndex === -1) {
    throw new Error("users_master に internal_user_id 列がありません");
  }

  let targetRowIndex = -1;
  let beforeUser = null;

  for (let i = 1; i < values.length; i++) {
    const rowUserId = normalizeText(values[i][userIdIndex]);

    if (rowUserId === targetUserId) {
      targetRowIndex = i + 1;
      beforeUser = rowToAccountConsoleObject_(headers, values[i]);
      break;
    }
  }

  if (!beforeUser) {
    return {
      success: false,
      ok: false,
      code: "USER_NOT_FOUND",
      message: "対象ユーザーが見つかりません"
    };
  }

  const afterUser = Object.assign({}, beforeUser);

  const editableFields = [
    "employee_code",
    "email",
    "family_name",
    "given_name",
    "name",
    "display_name",
    "role",
    "organization_id",
    "department",
    "position",
    "base_area",
    "phone",
    "memo",
    "status",
    "workStatus",
    "sortOrder",
    "allowed_modules",
    "ordercase_permission",
    "shiftbuilder_permission",
    "person_type",
    "affiliation_type",
    "contract_type",
    "grade_role",
    "engagement_status"
  ];

  editableFields.forEach(function(field) {
    if (payload[field] === undefined) {
      return;
    }

    if (field === "email") {
      afterUser[field] = normalizeAccountConsoleEmail_(payload[field]);
    } else if (field === "allowed_modules") {
      afterUser[field] = normalizeAccountConsoleModules_(payload[field]);
    } else {
      afterUser[field] = normalizeText(payload[field]);
    }
  });

  if (payload.engagement_status === undefined && payload.workStatus !== undefined) {
    afterUser.engagement_status = convertWorkStatusToEngagementStatus_(payload.workStatus);
  }

  if (normalizeText(afterUser.person_type) === "internal") {
    afterUser.organization_id = "internal";
  }

  assertAccountConsoleSelfSensitiveFieldsUnchanged_(
    operator,
    beforeUser,
    afterUser,
    targetUserId
  );

  assertDeveloperAccountMutationAllowed_(
    operator,
    beforeUser.role,
    afterUser.role,
    targetUserId
  );
  assertLastActiveDeveloperProtected_(
    values.slice(1).map(function(row) {
      return rowToAccountConsoleObject_(headers, row);
    }),
    beforeUser,
    afterUser
  );

  const developerAuthorizationEventId = beginDeveloperAccountAuthorizationEvent_(
    operator,
    beforeUser.role,
    afterUser.role,
    targetUserId,
    "Account Consoleでdeveloperアカウントを変更"
  );

  afterUser.updated_at = getNowIsoStringJst();
  afterUser.updated_by = operator.email;

  // ===== メール重複チェックここから =====
  if (normalizeAccountConsoleEmail_(beforeUser.email) !== normalizeAccountConsoleEmail_(afterUser.email)) {
    const existingUser = findUserByEmail(afterUser.email);

    if (existingUser && normalizeText(existingUser.internal_user_id) !== targetUserId) {
      return {
        success: false,
        ok: false,
        code: "EMAIL_ALREADY_EXISTS",
        message: "このメールアドレスはすでに登録されています"
      };
    }
  }
  // ===== メール重複チェックここまで =====

  editableFields.concat(["updated_at", "updated_by"]).forEach(function(field) {
    const columnIndex = headers.indexOf(field);
    if (columnIndex === -1) {
      return;
    }
    sheet.getRange(targetRowIndex, columnIndex + 1).setValue(
      afterUser[field] == null ? "" : afterUser[field]
    );
  });

  editableFields.forEach(function(field) {
    const beforeValue = normalizeText(beforeUser[field]);
    const afterValue = normalizeText(afterUser[field]);

    if (beforeValue !== afterValue) {
      appendAccountConsoleLog_({
        changedBy: operator.email,
        targetUserId: targetUserId,
        targetEmail: afterUser.email,
        field: field,
        beforeValue: beforeValue,
        afterValue: afterValue,
        memo: "Account Consoleで更新"
      });
    }
  });

  completeDeveloperAccountAuthorizationEvent_(
    developerAuthorizationEventId,
    operator,
    beforeUser.role,
    afterUser.role,
    targetUserId,
    "Account Consoleでdeveloperアカウントを変更"
  );

  return {
    success: true,
    ok: true,
    message: "ユーザーを更新しました",
    user: buildAccountConsoleUser_(afterUser)
  };
  } finally {
    lock.releaseLock();
  }
}
// ===== ユーザー更新ここまで =====


// ===== 自分自身の権限・状態変更禁止 ここから =====
function accountConsoleSensitiveValue_(user, field) {
  if (field === "workStatus") {
    return normalizeText(user && (user.workStatus || user.work_status)).toLowerCase();
  }
  if (field === "allowed_modules") {
    return normalizeAccountConsoleModules_(user && user.allowed_modules)
      .split(",")
      .filter(function(value) { return value !== ""; })
      .sort()
      .join(",");
  }
  return normalizeText(user && user[field]).toLowerCase();
}

function assertAccountConsoleSelfSensitiveFieldsUnchanged_(operator, beforeUser, afterUser, targetUserId) {
  if (normalizeText(operator && operator.internal_user_id) !== normalizeText(targetUserId)) {
    return true;
  }

  const protectedFields = [
    "role",
    "status",
    "workStatus",
    "engagement_status",
    "allowed_modules",
    "ordercase_permission",
    "shiftbuilder_permission"
  ];
  const changed = protectedFields.some(function(field) {
    return accountConsoleSensitiveValue_(beforeUser, field) !==
      accountConsoleSensitiveValue_(afterUser, field);
  });

  if (changed) {
    throw new Error("SELF_ACCOUNT_PERMISSION_CHANGE_FORBIDDEN");
  }

  return true;
}
// ===== 自分自身の権限・状態変更禁止 ここまで =====


// ===== developer特権保護 ここから =====
function assertDeveloperAccountMutationAllowed_(operator, beforeRole, afterRole, targetUserId) {
  const operatorRole = normalizeText(operator && operator.role).toLowerCase();
  const normalizedBeforeRole = normalizeText(beforeRole).toLowerCase();
  const normalizedAfterRole = normalizeText(afterRole).toLowerCase();
  const touchesDeveloper = normalizedBeforeRole === "developer" ||
    normalizedAfterRole === "developer";

  if (!touchesDeveloper) return true;

  if (operatorRole !== "developer") {
    throw new Error("DEVELOPER_ACCOUNT_MUTATION_FORBIDDEN");
  }

  if (normalizeText(targetUserId) === normalizeText(operator.internal_user_id) &&
      normalizedBeforeRole !== normalizedAfterRole) {
    throw new Error("SELF_ROLE_CHANGE_FORBIDDEN");
  }

  return true;
}

function assertLastActiveDeveloperProtected_(users, beforeUser, afterUser) {
  const wasActiveDeveloper = normalizeText(beforeUser && beforeUser.role).toLowerCase() === "developer" &&
    normalizeText(beforeUser && beforeUser.status).toLowerCase() === "active";
  const remainsActiveDeveloper = normalizeText(afterUser && afterUser.role).toLowerCase() === "developer" &&
    normalizeText(afterUser && afterUser.status).toLowerCase() === "active";

  if (!wasActiveDeveloper || remainsActiveDeveloper) return true;

  const activeDeveloperCount = (users || []).filter(function(user) {
    return normalizeText(user && user.role).toLowerCase() === "developer" &&
      normalizeText(user && user.status).toLowerCase() === "active";
  }).length;

  if (activeDeveloperCount <= 1) {
    throw new Error("LAST_ACTIVE_DEVELOPER_PROTECTED");
  }

  return true;
}

function beginDeveloperAccountAuthorizationEvent_(operator, beforeRole, afterRole, targetUserId, reason) {
  if (!isDeveloperRoleMutation_(beforeRole, afterRole)) return "";

  const eventId = "ACE-" + Utilities.getUuid();
  appendDeveloperAccountAuthorizationLog_(
    eventId,
    operator,
    beforeRole,
    afterRole,
    targetUserId,
    reason,
    "started"
  );
  return eventId;
}

function completeDeveloperAccountAuthorizationEvent_(
  eventId, operator, beforeRole, afterRole, targetUserId, reason
) {
  if (!normalizeText(eventId)) return;
  appendDeveloperAccountAuthorizationLog_(
    eventId,
    operator,
    beforeRole,
    afterRole,
    targetUserId,
    reason,
    "success"
  );
}

function appendDeveloperAccountAuthorizationLog_(
  eventId, operator, beforeRole, afterRole, targetUserId, reason, result
) {
  appendAuthorizationChangeLog_({
    authorization_event_id: eventId,
    event_type: "account.role.developer",
    actor_internal_user_id: normalizeText(operator && operator.internal_user_id),
    target_internal_user_id: normalizeText(targetUserId),
    before: { role: normalizeText(beforeRole).toLowerCase() },
    after: { role: normalizeText(afterRole).toLowerCase() },
    reason: normalizeText(reason),
    result: result,
    source: "account_console"
  });
}

function isDeveloperRoleMutation_(beforeRole, afterRole) {
  return normalizeText(beforeRole).toLowerCase() === "developer" ||
    normalizeText(afterRole).toLowerCase() === "developer";
}
// ===== developer特権保護 ここまで =====


// ===== Account Console 操作者確認ここから =====
function requireAccountConsoleOperator_(body) {
  const idToken = normalizeText(body.idToken);

  if (!idToken) {
    throw new Error("idToken が必要です");
  }

  const resolved = resolveCurrentUserByIdToken(idToken);

  if (!resolved || resolved.ok !== true || !resolved.user) {
    throw new Error("ログインユーザーを確認できません");
  }

  const user = resolved.user;
  const modules = Array.isArray(user.allowed_modules)
    ? user.allowed_modules
    : parseAllowedModules(user.allowed_modules);

  if (normalizeText(user.status).toLowerCase() !== "active") {
    throw new Error("このユーザーは停止中です");
  }

  if (normalizeText(user.role).toLowerCase() !== "developer" &&
      modules.indexOf(ACCOUNT_CONSOLE_MODULE_KEY) === -1) {
    throw new Error("Account Console の利用権限がありません");
  }

  return user;
}
// ===== Account Console 操作者確認ここまで =====


// ===== Account Console 編集者確認ここから =====
function isAccountConsoleEditor_(user) {
  const role = normalizeText(user && user.role).toLowerCase();
  return role === "admin" || role === "developer";
}

function requireAccountConsoleEditor_(body) {
  const operator = requireAccountConsoleOperator_(body);

  if (!isAccountConsoleEditor_(operator)) {
    throw new Error("ACCOUNT_CONSOLE_WRITE_FORBIDDEN");
  }

  return operator;
}
// ===== Account Console 編集者確認ここまで =====


// ===== Account Console用ユーザー整形ここから =====
function buildAccountConsoleUser_(user) {
  const workStatus = normalizeText(user.workStatus || user.work_status || "off");
  const engagementStatus = normalizeText(
    user.engagement_status ||
    convertWorkStatusToEngagementStatus_(workStatus)
  );

  return {
    internal_user_id: normalizeText(user.internal_user_id),
    auth_provider: normalizeText(user.auth_provider),
    auth_uid: normalizeText(user.auth_uid),
    employee_code: normalizeText(user.employee_code),
    email: normalizeAccountConsoleEmail_(user.email),
    family_name: normalizeText(user.family_name),
    given_name: normalizeText(user.given_name),
    name: normalizeText(user.name),
    display_name: normalizeText(user.display_name),
    role: normalizeText(user.role),
    organization_id: normalizeText(user.organization_id),
    department: normalizeText(user.department),
    position: normalizeText(user.position),
    base_area: normalizeText(user.base_area),
    phone: normalizeText(user.phone),
    memo: normalizeText(user.memo),
    status: normalizeText(user.status),
    workStatus: workStatus,
    sortOrder: normalizeText(user.sortOrder),
    allowed_modules: normalizeAccountConsoleModules_(user.allowed_modules),
    ordercase_permission: normalizeText(user.ordercase_permission),

    shiftbuilder_permission: normalizeText(user.shiftbuilder_permission),

    // ===== 人員区分・契約区分ここから =====
    person_type: normalizeText(user.person_type || inferPersonTypeFromRole_(user.role)),
    affiliation_type: normalizeText(
      user.affiliation_type ||
      inferAffiliationTypeFromPersonType_(user.person_type || inferPersonTypeFromRole_(user.role))
    ),
    contract_type: normalizeText(user.contract_type || "none"),
    grade_role: normalizeText(user.grade_role),
    engagement_status: engagementStatus,
    // ===== 人員区分・契約区分ここまで =====

    created_at: normalizeText(user.created_at),
    updated_at: normalizeText(user.updated_at),
    updated_by: normalizeText(user.updated_by)
  };
}
// ===== Account Console用ユーザー整形ここまで =====


// ===== ユーザーpayload検証ここから =====
function validateAccountConsoleUserPayload_(payload, isCreate) {
  if (!payload) {
    throw new Error("payload が必要です");
  }

  const familyName = normalizeText(payload.family_name);
  const givenName = normalizeText(payload.given_name);

  if (familyName !== "" && givenName === "" || familyName === "" && givenName !== "") {
    throw new Error("family_name と given_name は両方入力してください");
  }

  if (isCreate) {
    if (!normalizeText(payload.name) && !(familyName && givenName)) {
      throw new Error("name、または family_name と given_name が必要です");
    }

    if (!normalizeText(payload.email)) {
      throw new Error("email が必要です");
    }
  }

  if (payload.email !== undefined) {
    const email = normalizeAccountConsoleEmail_(payload.email);

    if (!email || email.indexOf("@") === -1) {
      throw new Error("email の形式が不正です");
    }
  }

  if (payload.role !== undefined) {
    const role = normalizeText(payload.role);

    if (VALID_ACCOUNT_ROLES.indexOf(role) === -1) {
      throw new Error("role が不正です: " + role);
    }
  }

  if (payload.status !== undefined) {
    const status = normalizeText(payload.status);

    if (VALID_ACCOUNT_STATUSES.indexOf(status) === -1) {
      throw new Error("status が不正です: " + status);
    }
  }

  if (payload.ordercase_permission !== undefined) {
    const permission = normalizeText(payload.ordercase_permission);

    if (VALID_ORDERCASE_PERMISSIONS.indexOf(permission) === -1) {
      throw new Error("ordercase_permission が不正です: " + permission);
    }
  }

  if (payload.shiftbuilder_permission !== undefined) {
  const permission = normalizeText(payload.shiftbuilder_permission);

  if (VALID_SHIFTBUILDER_PERMISSIONS.indexOf(permission) === -1) {
    throw new Error("shiftbuilder_permission が不正です: " + permission);
  }
}

  if (payload.person_type !== undefined) {
    const personType = normalizeText(payload.person_type);

    if (VALID_PERSON_TYPES.indexOf(personType) === -1) {
      throw new Error("person_type が不正です: " + personType);
    }
  }

  if (payload.affiliation_type !== undefined) {
    const affiliationType = normalizeText(payload.affiliation_type);

    if (VALID_AFFILIATION_TYPES.indexOf(affiliationType) === -1) {
      throw new Error("affiliation_type が不正です: " + affiliationType);
    }
  }

  if (payload.contract_type !== undefined) {
    const contractType = normalizeText(payload.contract_type);

    if (VALID_CONTRACT_TYPES.indexOf(contractType) === -1) {
      throw new Error("contract_type が不正です: " + contractType);
    }
  }

  if (payload.engagement_status !== undefined) {
    const engagementStatus = normalizeText(payload.engagement_status);

    if (VALID_ENGAGEMENT_STATUSES.indexOf(engagementStatus) === -1) {
      throw new Error("engagement_status が不正です: " + engagementStatus);
    }
  }
}
// ===== ユーザーpayload検証ここまで =====


// ===== internal_user_id生成ここから =====
function generateInternalUserId_() {
  const users = getUsersData();
  let maxNumber = 0;

  users.forEach(function(user) {
    const rawId = normalizeText(user.internal_user_id);
    const match = rawId.match(/^USR-(\d+)$/);

    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  });

  return "USR-" + String(maxNumber + 1).padStart(4, "0");
}
// ===== internal_user_id生成ここまで =====


// ===== 人員区分推定ここから =====
function inferPersonTypeFromRole_(role) {
  const normalizedRole = normalizeText(role);

  if (normalizedRole === "partner_individual") {
    return "alliance_individual";
  }

  if (normalizedRole === "partner_company" || normalizedRole === "partner_company_admin") {
    return "alliance_company_member";
  }

  if (normalizedRole === "agency") {
    return "agency";
  }

  return "internal";
}
// ===== 人員区分推定ここまで =====


// ===== 所属区分推定ここから =====
function inferAffiliationTypeFromPersonType_(personType) {
  const normalizedPersonType = normalizeText(personType);

  if (normalizedPersonType === "internal") {
    return "another_member";
  }

  if (normalizedPersonType === "alliance_individual" || normalizedPersonType === "alliance_company_member") {
    return "external_member";
  }

  // agency と未知の値は所属区分を推測しない。
  return "";
}
// ===== 所属区分推定ここまで =====


// ===== workStatusからengagement_status変換ここから =====
function convertWorkStatusToEngagementStatus_(workStatus) {
  const normalizedWorkStatus = normalizeText(workStatus).toLowerCase();

  if (normalizedWorkStatus === "on" || normalizedWorkStatus === "active" || normalizedWorkStatus === "available") {
    return "active";
  }

  return "inactive";
}
// ===== workStatusからengagement_status変換ここまで =====


// ===== 汎用整形ここから =====
function normalizeAccountConsoleEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeAccountConsoleModules_(value) {
  if (Array.isArray(value)) {
    return value
      .map(function(item) {
        return normalizeText(item);
      })
      .filter(function(item) {
        return item !== "";
      })
      .join(",");
  }

  return String(value || "")
    .split(",")
    .map(function(item) {
      return normalizeText(item);
    })
    .filter(function(item) {
      return item !== "";
    })
    .join(",");
}

function rowToAccountConsoleObject_(headers, row) {
  const obj = {};

  headers.forEach(function(header, index) {
    obj[header] = row[index];
  });

  return obj;
}

function getAccountConsoleFullName_(payload) {
  const name = normalizeText(payload.name);

  if (name) {
    return name;
  }

  return [normalizeText(payload.family_name), normalizeText(payload.given_name)]
    .filter(function(value) {
      return value !== "";
    })
    .join("");
}

function ensureAccountConsoleNameColumns_() {
  const sheet = getUsersSheet();
  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
      return normalizeText(header);
    })
    : [];
  const requiredHeaders = [
    "family_name",
    "given_name",
    "person_type",
    "affiliation_type",
    "contract_type",
    "grade_role",
    "engagement_status"
  ];
  const missingHeaders = requiredHeaders.filter(function(header) {
    return headers.indexOf(header) === -1;
  });

  if (missingHeaders.length > 0) {
    sheet.getRange(1, lastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    Logger.log("users_master に列を追加しました: " + missingHeaders.join(", "));
  }

  backfillAccountConsoleAffiliationTypes_(sheet);
  return sheet;
}

function backfillAccountConsoleAffiliationTypes_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const headers = values[0].map(function(header) {
    return normalizeText(header);
  });
  const personTypeIndex = headers.indexOf("person_type");
  const affiliationTypeIndex = headers.indexOf("affiliation_type");

  if (personTypeIndex === -1 || affiliationTypeIndex === -1) {
    Logger.log("人員区分の補完をスキップしました。必要列がありません。");
    return;
  }

  let updatedCount = 0;
  const affiliationValues = values.slice(1).map(function(row) {
    const currentAffiliationType = normalizeText(row[affiliationTypeIndex]);

    if (currentAffiliationType) {
      return [currentAffiliationType];
    }

    const inferredAffiliationType = inferAffiliationTypeFromPersonType_(row[personTypeIndex]);

    if (inferredAffiliationType) {
      updatedCount++;
    }

    return [inferredAffiliationType];
  });

  if (updatedCount > 0) {
    sheet.getRange(2, affiliationTypeIndex + 1, affiliationValues.length, 1).setValues(affiliationValues);
    Logger.log("affiliation_type を安全に補完しました: " + updatedCount + " 件");
  }
}

function setIfHeaderExists_(obj, headers, key, value) {
  if (headers.indexOf(key) !== -1) {
    obj[key] = value;
    return true;
  }

  Logger.log("保存対象の列がないため値を保存できません: " + key);
  return false;
}
// ===== 汎用整形ここまで =====


// ===== Account Console ユーザー管理ここまで =====
