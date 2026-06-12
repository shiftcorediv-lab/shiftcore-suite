export function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

export function getQueryParams() {
  const url = new URL(window.location.href);
  return Object.fromEntries(url.searchParams.entries());
}

function getStoredPortalUser() {
  try {
    const raw = sessionStorage.getItem("shiftcore_portal_user");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

export function buildCurrentUserFromQuery(params) {
  const stored = getStoredPortalUser();

  return {
    userId: normalizeText(
      params.userId || params.user_id || params.userid || stored.userId || stored.user_id
    ),
    displayName: normalizeText(
      params.displayName || params.display_name || params.name || stored.displayName || stored.name
    ),
    employeeCode: normalizeText(
      params.employeeCode || params.employee_code || params.employeeId || params.employee_id || stored.employeeCode || stored.employee_code
    ).toUpperCase(),
    role: normalizeText(
      params.role || stored.role
    ),
    workStatus: normalizeText(
      params.workStatus || params.work_status || stored.workStatus || stored.work_status
    ).toLowerCase()
  };
}
