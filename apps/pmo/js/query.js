export function isLineInAppBrowser() {
  const ua = navigator.userAgent || "";
  return ua.includes("Line/");
}

export function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

export function getQueryParams() {
  const url = new URL(window.location.href);
  return Object.fromEntries(url.searchParams.entries());
}

export function buildCurrentUserFromQuery(params) {
  return {
    userId: normalizeText(params.userId || params.user_id || params.userid),
    displayName: normalizeText(params.displayName || params.display_name || params.name),
    employeeCode: normalizeText(params.employeeCode || params.employee_code || params.employeeId || params.employee_id).toUpperCase(),
    role: normalizeText(params.role),
    workStatus: normalizeText(params.workStatus || params.work_status).toLowerCase()
  };
}
