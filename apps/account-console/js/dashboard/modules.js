import { MODULE_NAME_MAP } from "./config.js?v=20260802-modules-1";
import { moduleList, userModuleList } from "./dom.js";
import { openModule } from "./navigation.js?v=20260802-modules-1";

const MODULE_ALIASES = { shiftbuilder: "shift", order_case: "ordercase" };
const ADMIN_ROLES = ["admin", "developer", "dev"];
const ORDERCASE_PERMISSIONS = ["all", "edit", "view", "view_without_amount"];
const SHIFT_PERMISSIONS = ["all", "manager", "edit", "view", "self"];
const OPENABLE_MODULES = ["account", "account_console", "pmo", "ordercase", "shift"];

function normalizeModule(moduleCode) {
  const code = String(moduleCode || "").trim().toLowerCase();
  return MODULE_ALIASES[code] || code;
}

function hasPermission(user, key, allowedValues) {
  return allowedValues.includes(String(user?.[key] || "").trim().toLowerCase());
}

function moduleArray(modules) {
  return Array.isArray(modules)
    ? modules
    : String(modules || "").split(",").map(value => value.trim()).filter(Boolean);
}

function canUseModule(moduleCode, user) {
  const role = String(user?.role || "").trim().toLowerCase();
  if ((moduleCode === "account" || moduleCode === "account_console") && !ADMIN_ROLES.includes(role)) return false;
  if (moduleCode === "account_console") {
    const allowed = moduleArray(user?.allowed_modules).map(normalizeModule);
    return allowed.includes("account");
  }
  if (moduleCode === "ordercase") return hasPermission(user, "ordercase_permission", ORDERCASE_PERMISSIONS);
  if (moduleCode === "shift") return hasPermission(user, "shiftbuilder_permission", SHIFT_PERMISSIONS);
  return OPENABLE_MODULES.includes(moduleCode);
}

export function getEffectiveModules(modules, user) {
  const effective = [];
  moduleArray(modules).forEach(rawCode => {
    const moduleCode = normalizeModule(rawCode);
    if (!moduleCode || effective.includes(moduleCode) || !canUseModule(moduleCode, user)) return;
    effective.push(moduleCode);
  });
  return effective;
}

function buildModuleButton(moduleCode, className, setStatus) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = MODULE_NAME_MAP[moduleCode] || moduleCode;
  button.addEventListener("click", () => openModule(moduleCode, setStatus));
  return button;
}

export function renderModules(modules, user, setStatus) {
  if (!moduleList) return;
  moduleList.innerHTML = "";
  const effectiveModules = getEffectiveModules(modules, user);
  if (!effectiveModules.length) {
    moduleList.innerHTML = "<div class='module-card'><div class='module-card-title'>利用可能モジュールなし</div></div>";
    return;
  }
  effectiveModules.forEach(moduleCode => {
    const card = document.createElement("div");
    const title = document.createElement("div");
    const code = document.createElement("div");
    card.className = "module-card";
    title.className = "module-card-title";
    title.textContent = MODULE_NAME_MAP[moduleCode] || moduleCode;
    code.className = "module-card-code";
    code.textContent = "module_code: " + moduleCode;
    card.append(title, code, buildModuleButton(moduleCode, "", setStatus));
    moduleList.appendChild(card);
  });
}

export function renderModuleMenu(modules, user, setStatus) {
  if (!userModuleList) return;
  userModuleList.innerHTML = "";
  const effectiveModules = getEffectiveModules(modules, user);
  if (!effectiveModules.length) {
    userModuleList.innerHTML = "<div class='empty-state'>利用可能なモジュールはありません。</div>";
    return;
  }
  effectiveModules.forEach(moduleCode => {
    userModuleList.appendChild(buildModuleButton(moduleCode, "user-module-button", setStatus));
  });
}
