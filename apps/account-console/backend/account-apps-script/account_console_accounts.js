
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

  if (modules.indexOf(ACCOUNT_CONSOLE_MODULE_KEY) === -1) {
    throw new Error("Account Console の利用権限がありません");
  }

  return user;
}
// ===== Account Console 操作者確認ここまで =====


// ===== Account Console用ユーザー整形ここから =====
function buildAccountConsoleUser_(user) {
  return {
    internal_user_id: normalizeText(user.internal_user_id),
    auth_provider: normalizeText(user.auth_provider),
    auth_uid: normalizeText(user.auth_uid),
    employee_code: normalizeText(user.employee_code),
    email: normalizeAccountConsoleEmail_(user.email),
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
    workStatus: normalizeText(user.workStatus || user.work_status || "off"),
    sortOrder: normalizeText(user.sortOrder),
    allowed_modules: normalizeAccountConsoleModules_(user.allowed_modules),
    ordercase_permission: normalizeText(user.ordercase_permission),
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

  if (isCreate) {
    if (!normalizeText(payload.name)) {
      throw new Error("name が必要です");
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

function setIfHeaderExists_(obj, headers, key, value) {
  if (headers.indexOf(key) !== -1) {
    obj[key] = value;
  }
}
// ===== 汎用整形ここまで =====


// ===== Account Console ユーザー管理ここまで =====