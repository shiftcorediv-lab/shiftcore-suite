// =========================
// roster整形ここから
// 月次生成用
// =========================
function normalizeRoster(roster) {
  if (!Array.isArray(roster)) {
    throw new Error("roster は配列で渡してください");
  }

  const normalized = roster.map(function(item, index) {
    return {
      originalIndex: index,
      userId: normalizeText(item.userId || item.user_id),
      displayName: normalizeText(item.displayName || item.display_name || item.name),
      employeeCode: normalizeText(
        item.employeeCode || item.employee_code || item.employeeId || item.employee_id
      ).toUpperCase(),
      role: normalizeText(item.role),
      workStatus: normalizeText(item.workStatus || item.work_status).toLowerCase()
    };
  }).filter(function(item) {
    if (!item.displayName || !item.employeeCode) {
      return false;
    }

    if (SETTINGS.EXCLUDED_WORK_STATUSES_FOR_MONTHLY.indexOf(item.workStatus) !== -1) {
      return false;
    }

    return true;
  });

  if (normalized.length === 0) {
    throw new Error("有効な roster データがありません");
  }

  normalized.sort(function(a, b) {
    return a.originalIndex - b.originalIndex;
  });

  return normalized;
}
// =========================
// roster整形ここまで
// =========================


// =========================
// ShiftCore roster 取得ここから
// ShiftCore API: GET ?action=getPmoRoster
// =========================
function fetchRosterFromShiftCore_() {
  if (!SETTINGS.SHIFTCORE_ROSTER_API_URL) {
    throw new Error("SHIFTCORE_ROSTER_API_URL が未設定です");
  }

  const url = SETTINGS.SHIFTCORE_ROSTER_API_URL + "?action=getPmoRoster";

  const response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true
  });

  const responseText = response.getContentText();
  let json;

  try {
    json = JSON.parse(responseText);
  } catch (error) {
    throw new Error("ShiftCore roster API のレスポンス解析に失敗しました");
  }

  if (!json.success) {
    throw new Error(json.message || "ShiftCore roster API が失敗しました");
  }

  if (!Array.isArray(json.roster)) {
    throw new Error("ShiftCore roster API の roster が不正です");
  }

  return json.roster;
}
// =========================
// ShiftCore roster 取得ここまで
// =========================