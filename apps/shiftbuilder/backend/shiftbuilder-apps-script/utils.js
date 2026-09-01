// ===== ShiftBuilder Utils ここから =====


// ===== 基本文字列処理ここから =====
function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeMonth(value) {
  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  // 2026-07 / 2026/07 / 202607 を 2026-07 に寄せる
  const compact = text.replace(/\//g, "-");

  if (/^\d{6}$/.test(compact)) {
    return compact.slice(0, 4) + "-" + compact.slice(4, 6);
  }

  if (/^\d{4}-\d{1,2}$/.test(compact)) {
    const parts = compact.split("-");
    return parts[0] + "-" + String(Number(parts[1])).padStart(2, "0");
  }

  return compact;
}

function normalizeDateString(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }

  const text = normalizeText(value).replace(/\//g, "-");

  if (/^\d{8}$/.test(text)) {
    return text.slice(0, 4) + "-" + text.slice(4, 6) + "-" + text.slice(6, 8);
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const parts = text.split("-");
    return [
      parts[0],
      String(Number(parts[1])).padStart(2, "0"),
      String(Number(parts[2])).padStart(2, "0")
    ].join("-");
  }

  return text;
}

function getNowIsoStringJst() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ssXXX");
}
// ===== 基本文字列処理ここまで =====


// ===== 配列・CSV処理ここから =====
function parseCsvText(value) {
  return normalizeText(value)
    .split(",")
    .map(function(item) {
      return normalizeText(item);
    })
    .filter(function(item) {
      return item !== "";
    });
}

function includesCsvValue(value, target) {
  const list = parseCsvText(value);
  return list.indexOf(normalizeText(target)) !== -1;
}
// ===== 配列・CSV処理ここまで =====


// ===== シート行変換ここから =====
function getHeaderMap_(headers) {
  const map = {};

  headers.forEach(function(header, index) {
    map[normalizeText(header)] = index;
  });

  return map;
}

function rowToObject_(headers, row) {
  const obj = {};

  headers.forEach(function(header, index) {
    obj[normalizeText(header)] = row[index];
  });

  return obj;
}

function getSheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(function(header) {
    return normalizeText(header);
  });

  return values.slice(1).map(function(row, index) {
    const obj = rowToObject_(headers, row);
    obj.__rowNumber = index + 2;
    return obj;
  });
}

function setIfHeaderExists_(obj, headers, key, value) {
  if (headers.indexOf(key) !== -1) {
    obj[key] = value;
  }
}
// ===== シート行変換ここまで =====


// ===== 権限判定ここから =====
function hasShiftBuilderModule_(user) {
  return normalizeLowerText(user && user.role) === "developer" ||
    includesCsvValue(user.allowed_modules, SHIFTBUILDER_MODULE_KEY);
}

function hasShiftBuilderPermission_(user) {
  return normalizeLowerText(user && user.role) === "developer" ||
    VALID_SHIFTBUILDER_PERMISSIONS.indexOf(normalizeText(user.shiftbuilder_permission)) !== -1;
}

function canEditShiftBuilder_(user) {
  return normalizeLowerText(user && user.role) === "developer" ||
    SHIFTBUILDER_EDITABLE_PERMISSIONS.indexOf(normalizeText(user.shiftbuilder_permission)) !== -1;
}

function isShiftBuilderAssignableUser_(user) {
  if (!user) return false;
  if (normalizeLowerText(user.status) !== "active") return false;
  if (normalizeLowerText(user.role) === "developer") return false;
  if (!includesCsvValue(user.allowed_modules, SHIFTBUILDER_MODULE_KEY)) return false;
  if (VALID_SHIFTBUILDER_PERMISSIONS.indexOf(normalizeText(user.shiftbuilder_permission)) === -1) {
    return false;
  }

  const workStatus = normalizeLowerText(user.workStatus || user.work_status);
  const engagementStatus = normalizeLowerText(user.engagement_status);

  if (workStatus && workStatus !== "on") return false;
  if (engagementStatus && engagementStatus !== "active") return false;

  return workStatus === "on" || engagementStatus === "active";
}

function requireShiftBuilderUser_(user) {
  if (!user) {
    throw new Error("ログインユーザーを確認できません");
  }

  if (normalizeLowerText(user.status) !== "active") {
    throw new Error("このユーザーは停止中です");
  }

  if (!hasShiftBuilderModule_(user)) {
    throw new Error("ShiftBuilderを利用する権限がありません");
  }

  if (!hasShiftBuilderPermission_(user)) {
    throw new Error("ShiftBuilder権限が設定されていません");
  }

  return user;
}

function requireShiftBuilderEditor_(user) {
  requireShiftBuilderUser_(user);

  if (!canEditShiftBuilder_(user)) {
    throw new Error("ShiftBuilderを編集する権限がありません");
  }

  return user;
}
// ===== 権限判定ここまで =====


// ===== セル状態ここから =====
function calculateCellStatus_(requiredPeople, assignedCount) {
  const required = Number(requiredPeople || 0);
  const assigned = Number(assignedCount || 0);

  if (required <= 0) {
    return {
      cell_status: CELL_STATUS.COMPLETED,
      cell_status_label: CELL_STATUS_LABELS[CELL_STATUS.COMPLETED],
      required_people: required,
      assigned_count: assigned
    };
  }

  if (assigned === 0) {
    return {
      cell_status: CELL_STATUS.UNASSIGNED,
      cell_status_label: CELL_STATUS_LABELS[CELL_STATUS.UNASSIGNED],
      required_people: required,
      assigned_count: assigned
    };
  }

  if (assigned < required) {
    return {
      cell_status: CELL_STATUS.SHORTAGE,
      cell_status_label: CELL_STATUS_LABELS[CELL_STATUS.SHORTAGE],
      required_people: required,
      assigned_count: assigned
    };
  }

  if (assigned > required) {
    return {
      cell_status: CELL_STATUS.OVER,
      cell_status_label: CELL_STATUS_LABELS[CELL_STATUS.OVER],
      required_people: required,
      assigned_count: assigned
    };
  }

  return {
    cell_status: CELL_STATUS.COMPLETED,
    cell_status_label: CELL_STATUS_LABELS[CELL_STATUS.COMPLETED],
    required_people: required,
    assigned_count: assigned
  };
}
// ===== セル状態ここまで =====


// ===== ID生成ここから =====
function generateId_(prefix) {
  const stamp = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHHmmss");
  const random = Math.floor(Math.random() * 1000000);

  return normalizeText(prefix) + "-" + stamp + "-" + String(random).padStart(6, "0");
}

function generateShiftMonthId_() {
  return generateId_("SM");
}

function generateAssignmentId_() {
  return generateId_("SA");
}
// ===== ID生成ここまで =====


// ===== レスポンスここから =====
function ok_(data) {
  return Object.assign(
    {
      success: true,
      ok: true
    },
    data || {}
  );
}

function ng_(message, code) {
  return {
    success: false,
    ok: false,
    code: code || "ERROR",
    message: message || "エラーが発生しました"
  };
}
// ===== レスポンスここまで =====


// ===== ShiftBuilder Utils ここまで =====
