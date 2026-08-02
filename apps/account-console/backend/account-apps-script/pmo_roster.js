// ===== PMO roster 1件整形ここから =====
function buildPmoRosterUser(user) {
  return {
    userId: String(user.internal_user_id || "").trim(),
    displayName: String(user.name || "").trim(),
    employeeCode: String(user.employee_code || "").trim().toUpperCase(),
    role: String(user.role || "").trim(),
    workStatus: getNormalizedWorkStatus(user)
  };
}
// ===== PMO roster 1件整形ここまで =====


// ===== PMO roster 取得ここから =====
function getPmoRoster() {
  try {
    const users = getUsersData();

    const roster = users
      .map(buildPmoRosterUser)
      .filter(user => {
        if (!user.userId || !user.displayName || !user.employeeCode) {
          return false;
        }

        if (user.workStatus !== "on") {
          return false;
        }

        return true;
      });

    return {
      success: true,
      roster: roster
    };

  } catch (error) {
    return {
      success: false,
      message: "getPmoRoster でエラーが発生しました: " + String(error.message || error)
    };
  }
}
// ===== PMO roster 取得ここまで =====