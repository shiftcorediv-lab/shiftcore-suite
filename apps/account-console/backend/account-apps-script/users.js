// ===== ユーザーシート取得ここから =====
function getUsersSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET_NAME);

  if (!sheet) {
    throw new Error("users_master シートが見つかりません");
  }

  return sheet;
}
// ===== ユーザーシート取得ここまで =====


// ===== ユーザー一覧取得ここから =====
function getUsersData() {
  const sheet = getUsersSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const rows = values.slice(1);

  return rows.map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    return obj;
  });
}
// ===== ユーザー一覧取得ここまで =====


// ===== 一覧テストここから =====
function testGetUsersData() {
  const users = getUsersData();
  Logger.log(JSON.stringify(users, null, 2));
}
// ===== 一覧テストここまで =====


// ===== メールでユーザー検索ここから =====
function findUserByEmail(email) {
  const users = getUsersData();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const user = users.find(row => {
    return String(row.email || "").trim().toLowerCase() === normalizedEmail;
  });

  return user || null;
}
// ===== メールでユーザー検索ここまで =====


// ===== 検索テストここから =====
function testFindUserByEmail() {
  const email = "shiftcore.div@gmail.com";
  const user = findUserByEmail(email);
  Logger.log(JSON.stringify(user, null, 2));
}
// ===== 検索テストここまで =====


// ===== allowed_modules整形ここから =====
function parseAllowedModules(value) {
  return String(value || "")
    .split(",")
    .map(v => v.trim())
    .filter(v => v !== "");
}
// ===== allowed_modules整形ここまで =====


// ===== workStatus正規化ここから =====
function getNormalizedWorkStatus(user) {
  const raw = String(
    user.work_status ||
    user.workStatus ||
    ""
  ).trim().toLowerCase();

  if (raw === "on" || raw === "off") {
    return raw;
  }

  return "off";
}
// ===== workStatus正規化ここまで =====


// ===== engagement_status正規化ここから =====
function getNormalizedEngagementStatus(user) {
  const raw = String(
    user.engagement_status ||
    ""
  ).trim().toLowerCase();

  if (raw === "active" || raw === "inactive") {
    return raw;
  }

  const workStatus = getNormalizedWorkStatus(user);

  if (workStatus === "on") {
    return "active";
  }

  return "inactive";
}
// ===== engagement_status正規化ここまで =====


// ===== person_type正規化ここから =====
function getNormalizedPersonType(user) {
  const raw = String(user.person_type || "").trim();

  if (raw) {
    return raw;
  }

  const role = String(user.role || "").trim();

  if (role === "partner_individual") {
    return "alliance_individual";
  }

  if (role === "partner_company" || role === "partner_company_admin") {
    return "alliance_company_member";
  }

  if (role === "agency") {
    return "agency";
  }

  return "internal";
}
// ===== person_type正規化ここまで =====


// ===== contract_type正規化ここから =====
function getNormalizedContractType(user) {
  const raw = String(user.contract_type || "").trim();

  if (raw) {
    return raw;
  }

  const personType = getNormalizedPersonType(user);

  if (personType !== "internal") {
    return "none";
  }

  return "none";
}
// ===== contract_type正規化ここまで =====


// ===== ユーザー返却データ整形ここから =====
function buildLoginUserResponse(user) {
  const personType = getNormalizedPersonType(user);
  const contractType = getNormalizedContractType(user);
  const engagementStatus = getNormalizedEngagementStatus(user);

  const response = {
    internal_user_id: String(user.internal_user_id || "").trim(),
    employee_code: String(user.employee_code || "").trim(),
    email: String(user.email || "").trim(),
    name: String(user.name || "").trim(),
    display_name: String(user.display_name || user.name || "").trim(),
    role: String(user.role || "").trim(),
    organization_id: String(user.organization_id || "").trim(),
    status: String(user.status || "").trim(),
    work_status: getNormalizedWorkStatus(user),
    allowed_modules: parseAllowedModules(user.allowed_modules),
    ordercase_permission: String(user.ordercase_permission || "").trim(),

    // 人員区分・契約区分
    person_type: personType,
    contract_type: contractType,
    engagement_status: engagementStatus,

    // フロント連携しやすい別名
    userId: String(user.internal_user_id || "").trim(),
    displayName: String(user.display_name || user.name || "").trim(),
    employeeCode: String(user.employee_code || "").trim(),
    workStatus: getNormalizedWorkStatus(user),
    personType: personType,
    contractType: contractType,
    engagementStatus: engagementStatus
  };

  response.pmoV2Url = buildPmoV2Url(response);

  return response;
}
// ===== ユーザー返却データ整形ここまで =====


// ===== ログイン可否判定ここから =====
function checkLoginUserByEmail(email) {
  const user = findUserByEmail(email);

  if (!user) {
    return {
      ok: false,
      code: "USER_NOT_FOUND",
      message: "ユーザーが登録されていません"
    };
  }

  if (String(user.status || "").trim().toLowerCase() !== "active") {
    return {
      ok: false,
      code: "USER_STOPPED",
      message: "このユーザーは停止中です"
    };
  }

  return {
    ok: true,
    code: "OK",
    message: "ログイン可能です",
    user: buildLoginUserResponse(user)
  };
}
// ===== ログイン可否判定ここまで =====


// ===== ログイン可否テストここから =====
function testCheckLoginUserByEmail() {
  const result = checkLoginUserByEmail("shiftcore.div@gmail.com");
  Logger.log(JSON.stringify(result, null, 2));
}
// ===== ログイン可否テストここまで =====