import { SIGNUP_ADMIN_URL, DASHBOARD_URL, ACCOUNT_ALLOWED_ROLES } from "./config.js";

export function canUseAccountPortal(currentUser) {
  const role = String(currentUser?.role || "").trim().toLowerCase();
  return ACCOUNT_ALLOWED_ROLES.includes(role);
}

export function buildSignupAdminUrl(currentUser) {
  const targetUrl = new URL(SIGNUP_ADMIN_URL, window.location.href);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "account_signup_admin");
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
