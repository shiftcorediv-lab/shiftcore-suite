import { MODULE_NAME_MAP, MODULE_DESCRIPTION_MAP } from "./config.js?v=20260802-reorder-1";
import { moduleList, userModuleList } from "./dom.js";
import { openModule } from "./navigation.js?v=20260803-role-1";

const MODULE_ALIASES = { account: "account_console", shiftbuilder: "shift", order_case: "ordercase" };
const ADMIN_ROLES = ["admin", "developer"];
const ORDERCASE_PERMISSIONS = ["all", "edit", "view", "view_without_amount"];
const SHIFT_PERMISSIONS = ["all", "manager", "edit", "view", "self"];
const OPENABLE_MODULES = ["account_console", "pmo", "ordercase", "shift"];

function normalizeModule(moduleCode) {
  const code = String(moduleCode || "").trim().toLowerCase();
  return MODULE_ALIASES[code] || code;
}

function hasPermission(user, keys, allowedValues) {
  const value = keys.map(key => user?.[key]).find(Boolean);
  return allowedValues.includes(String(value || "").trim().toLowerCase());
}

function permissionValue(user, keys) {
  return String(keys.map(key => user?.[key]).find(Boolean) || "").trim().toLowerCase();
}

function moduleArray(modules) {
  return Array.isArray(modules)
    ? modules
    : String(modules || "").split(",").map(value => value.trim()).filter(Boolean);
}

function canUseModule(moduleCode, user) {
  const role = String(user?.role || "").trim().toLowerCase();
  if (moduleCode === "account_console" && !ADMIN_ROLES.includes(role)) return false;
  if (moduleCode === "ordercase") return hasPermission(user, ["ordercase_permission", "ordercasePermission"], ORDERCASE_PERMISSIONS);
  if (moduleCode === "shift") {
    const value = permissionValue(user, ["shiftbuilder_permission", "shiftBuilderPermission", "shift_permission"]);
    // ログイン照合APIが詳細権限を返さない場合も、モジュール許諾があれば入口は表示する。
    // ShiftBuilder側で最新の詳細権限を再取得し、編集可否を最終判定する。
    return !value || SHIFT_PERMISSIONS.includes(value);
  }
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

function buildModuleButton(moduleCode, className, setStatus, label) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = label || MODULE_NAME_MAP[moduleCode] || moduleCode;
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
    const description = document.createElement("div");
    const code = document.createElement("div");
    card.className = "module-card";
    title.className = "module-card-title";
    title.textContent = MODULE_NAME_MAP[moduleCode] || moduleCode;
    description.className = "module-card-description";
    description.textContent = MODULE_DESCRIPTION_MAP[moduleCode] || "業務モジュール";
    code.className = "module-card-code";
    code.textContent = "module_code: " + moduleCode;
    card.append(title, buildModuleButton(moduleCode, "", setStatus, "開く"), description, code);
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
