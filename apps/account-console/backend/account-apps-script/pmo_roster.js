// ===== PMO roster 1件整形ここから =====
function buildPmoRosterUser(user) {
  return {
    displayName: String(user.name || "").trim(),
    employeeCode: String(user.employee_code || "").trim().toUpperCase(),
    role: String(user.role || "").trim(),
    status: String(user.status || "").trim().toLowerCase(),
    workStatus: getNormalizedWorkStatus(user)
  };
}
// ===== PMO roster 1件整形ここまで =====


// ===== PMO roster サービス認証ここから =====
function requirePmoRosterService_(providedSecret) {
  const expected = normalizeText(PropertiesService.getScriptProperties()
    .getProperty(PMO_ROSTER_SERVICE_SECRET_PROPERTY));

  if (!expected || normalizeText(providedSecret) !== expected) {
    const error = new Error("SERVICE_AUTH_INVALID");
    error.code = "SERVICE_AUTH_INVALID";
    throw error;
  }
}
// ===== PMO roster サービス認証ここまで =====


// ===== PMO roster 取得ここから =====
function getPmoRosterSecure(serviceSecret) {
  requirePmoRosterService_(serviceSecret);

  try {
    const users = getUsersData();

    const roster = users
      .map(buildPmoRosterUser)
      .filter(user => {
        if (user.role.toLowerCase() === "developer") {
          return false;
        }

        if (user.status !== "active") {
          return false;
        }

        if (!user.displayName || !user.employeeCode) {
          return false;
        }

        if (user.workStatus !== "on") {
          return false;
        }

        return true;
      })
      .map(function(user) {
        return {
          displayName: user.displayName,
          employeeCode: user.employeeCode
        };
      });

    return {
      success: true,
      roster: roster
    };

  } catch (error) {
    return {
      success: false,
      message: "名簿の取得に失敗しました"
    };
  }
}
// ===== PMO roster 取得ここまで =====
