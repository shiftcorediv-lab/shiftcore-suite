import { PMO_V2_URL, PMO_ADMIN_URL, DASHBOARD_URL, PORTAL_ALLOWED_ROLES } from "./config.js";

export function canManagePmo(currentUser) {
  const role = String(currentUser?.role || "").trim().toLowerCase();
  return PORTAL_ALLOWED_ROLES.includes(role);
}

export function buildPmoApplyUrl(currentUser) {
  const targetUrl = new URL(PMO_V2_URL);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "pmo");
  targetUrl.searchParams.set("userId", currentUser.userId || "");
  targetUrl.searchParams.set("displayName", currentUser.displayName || "");
  targetUrl.searchParams.set("employeeCode", currentUser.employeeCode || "");
  targetUrl.searchParams.set("role", currentUser.role || "");
  targetUrl.searchParams.set("workStatus", currentUser.workStatus || "");

  return targetUrl.toString();
}

export function buildPmoAdminUrl(currentUser) {
  const targetUrl = new URL(PMO_ADMIN_URL, window.location.href);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "pmo_admin");
  targetUrl.searchParams.set("userId", currentUser.userId || "");
  targetUrl.searchParams.set("displayName", currentUser.displayName || "");
  targetUrl.searchParams.set("employeeCode", currentUser.employeeCode || "");
  targetUrl.searchParams.set("role", currentUser.role || "");
  targetUrl.searchParams.set("workStatus", currentUser.workStatus || "");

  return targetUrl.toString();
}

export function goToDashboard() {
  window.location.href = DASHBOARD_URL;
}
