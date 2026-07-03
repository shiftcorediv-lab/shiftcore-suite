import { LOGIN_PAGE_URL, PMO_V2_URL } from "./config.js";
import { getStoredUser } from "./storage.js";

const PMO_PORTAL_URL = "./pmo-portal.html";
const ACCOUNT_CONSOLE_URL = "./account-console.html";
const SHIFTBUILDER_URL = "../shiftbuilder/";
const ORDERCASE_URL = "../ordercase/";
const PMO_PORTAL_ROLES = ["admin", "developer", "dev"];

export function goToLogin() {
  window.location.href = LOGIN_PAGE_URL;
}

export function buildPmoFallbackUrl(storedUser) {
  const targetUrl = new URL(PMO_V2_URL);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "pmo");
  targetUrl.searchParams.set("userId", storedUser.userId || storedUser.internal_user_id || "");
  targetUrl.searchParams.set("displayName", storedUser.displayName || storedUser.name || "");
  targetUrl.searchParams.set("employeeCode", storedUser.employeeCode || storedUser.employee_code || "");
  targetUrl.searchParams.set("role", storedUser.role || "");
  targetUrl.searchParams.set("workStatus", storedUser.workStatus || storedUser.work_status || "");

  return targetUrl.toString();
}

export function buildPmoPortalUrl(storedUser) {
  const targetUrl = new URL(PMO_PORTAL_URL, window.location.href);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "pmo");
  targetUrl.searchParams.set("userId", storedUser.userId || storedUser.internal_user_id || "");
  targetUrl.searchParams.set("displayName", storedUser.displayName || storedUser.name || "");
  targetUrl.searchParams.set("employeeCode", storedUser.employeeCode || storedUser.employee_code || "");
  targetUrl.searchParams.set("role", storedUser.role || "");
  targetUrl.searchParams.set("workStatus", storedUser.workStatus || storedUser.work_status || "");

  return targetUrl.toString();
}

export function buildAccountConsoleUrl(storedUser) {
  const targetUrl = new URL(ACCOUNT_CONSOLE_URL, window.location.href);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "account");
  targetUrl.searchParams.set("userId", storedUser.userId || storedUser.internal_user_id || "");
  targetUrl.searchParams.set("displayName", storedUser.displayName || storedUser.name || "");
  targetUrl.searchParams.set("employeeCode", storedUser.employeeCode || storedUser.employee_code || "");
  targetUrl.searchParams.set("role", storedUser.role || "");
  targetUrl.searchParams.set("workStatus", storedUser.workStatus || storedUser.work_status || "");

  return targetUrl.toString();
}

export function buildShiftBuilderUrl(storedUser) {
  const targetUrl = new URL(SHIFTBUILDER_URL, window.location.href);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "shift");
  targetUrl.searchParams.set("userId", storedUser.userId || storedUser.internal_user_id || "");
  targetUrl.searchParams.set("displayName", storedUser.displayName || storedUser.name || "");
  targetUrl.searchParams.set("employeeCode", storedUser.employeeCode || storedUser.employee_code || "");
  targetUrl.searchParams.set("role", storedUser.role || "");
  targetUrl.searchParams.set("workStatus", storedUser.workStatus || storedUser.work_status || "");

  return targetUrl.toString();
}

export function buildOrderCaseUrl(storedUser) {
  const targetUrl = new URL(ORDERCASE_URL, window.location.href);

  targetUrl.searchParams.set("from", "shiftcore");
  targetUrl.searchParams.set("module", "ordercase");
  targetUrl.searchParams.set("userId", storedUser.userId || storedUser.internal_user_id || "");
  targetUrl.searchParams.set("displayName", storedUser.displayName || storedUser.name || "");
  targetUrl.searchParams.set("employeeCode", storedUser.employeeCode || storedUser.employee_code || "");
  targetUrl.searchParams.set("role", storedUser.role || "");
  targetUrl.searchParams.set("workStatus", storedUser.workStatus || storedUser.work_status || "");

  return targetUrl.toString();
}

function shouldUsePmoPortal(storedUser) {
  const role = String(storedUser?.role || "").trim().toLowerCase();
  return PMO_PORTAL_ROLES.includes(role);
}

export function openModule(moduleCode, setStatus) {
  const storedUser = getStoredUser();

  if (!storedUser) {
    setStatus("ユーザー情報がありません");
    return;
  }

  if (moduleCode === "pmo") {
    if (shouldUsePmoPortal(storedUser)) {
      window.location.href = buildPmoPortalUrl(storedUser);
      return;
    }

    if (storedUser.pmoV2Url) {
      window.location.href = storedUser.pmoV2Url;
      return;
    }

    window.location.href = buildPmoFallbackUrl(storedUser);
    return;
  }

  if (moduleCode === "account" || moduleCode === "account_console") {
    window.location.href = buildAccountConsoleUrl(storedUser);
    return;
  }

  if (moduleCode === "shift" || moduleCode === "shiftbuilder") {
    window.location.href = buildShiftBuilderUrl(storedUser);
    return;
  }

  if (moduleCode === "ordercase" || moduleCode === "order_case") {
    window.location.href = buildOrderCaseUrl(storedUser);
    return;
  }

  setStatus("このモジュールはまだ接続されていません: " + moduleCode);
}
