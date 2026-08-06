import { ACCOUNT_CONSOLE_URL, ACCOUNT_PORTAL_URL } from "./config.js?v=20260806-permission-2";
import { canUseSignupAdminAccess } from "../common/access-policy.mjs?v=20260806-permission-2";

export function canUseSignupAdmin(currentUser) {
  return canUseSignupAdminAccess(currentUser);
}

export function buildAccountPortalUrl(currentUser) {
  const targetUrl = new URL(ACCOUNT_CONSOLE_URL || ACCOUNT_PORTAL_URL, window.location.href);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "account");
  targetUrl.searchParams.set("userId", currentUser.userId || "");
  targetUrl.searchParams.set("displayName", currentUser.displayName || "");
  targetUrl.searchParams.set("employeeCode", currentUser.employeeCode || "");
  targetUrl.searchParams.set("role", currentUser.role || "");
  targetUrl.searchParams.set("workStatus", currentUser.workStatus || "");

  return targetUrl.toString();
}

export function goToAccountPortal(currentUser) {
  window.location.href = buildAccountPortalUrl(currentUser);
}
