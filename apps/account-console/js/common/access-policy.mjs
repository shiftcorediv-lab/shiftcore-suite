const ADMIN_ROLES = ["admin", "developer"];
const ORDERCASE_PERMISSIONS = ["all", "edit", "view", "view_without_amount"];
const MODULE_ALIASES = {
  account: "account_console",
  shiftbuilder: "shift",
  order_case: "ordercase"
};
const OPENABLE_MODULES = ["account_console", "pmo", "ordercase", "shift"];

export function normalizeModuleList(modules) {
  const values = Array.isArray(modules)
    ? modules
    : String(modules || "").split(",");

  return values
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export function canUseSignupAdminAccess(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  const modules = normalizeModuleList(
    user?.allowed_modules || user?.allowedModules || []
  );

  return ADMIN_ROLES.includes(role) || modules.includes("account_console");
}

function permissionValue(user, keys) {
  return String(keys.map((key) => user?.[key]).find(Boolean) || "")
    .trim()
    .toLowerCase();
}

function canUseModule(moduleCode, user) {
  const role = String(user?.role || "").trim().toLowerCase();

  if (moduleCode === "account_console") {
    return true;
  }

  if (moduleCode === "ordercase") {
    const value = permissionValue(
      user,
      ["ordercase_permission", "ordercasePermission"]
    );
    return ORDERCASE_PERMISSIONS.includes(value);
  }

  if (moduleCode === "shift") {
    // 旧値や表記揺れが残っていても入口だけは維持する。
    // 操作可否の最終防御は03でShiftBuilder GASを確認して正式設計する。
    return true;
  }

  return OPENABLE_MODULES.includes(moduleCode);
}

export function getEffectiveModuleCodes(modules, user) {
  const role = String(user?.role || "").trim().toLowerCase();
  if (role === "developer") {
    return [...OPENABLE_MODULES];
  }

  const effective = [];

  normalizeModuleList(modules).forEach((rawCode) => {
    const moduleCode = MODULE_ALIASES[rawCode] || rawCode;
    if (
      !moduleCode ||
      effective.includes(moduleCode) ||
      !canUseModule(moduleCode, user)
    ) {
      return;
    }
    effective.push(moduleCode);
  });

  return effective;
}
