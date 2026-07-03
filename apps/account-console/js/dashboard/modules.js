import { MODULE_NAME_MAP } from "./config.js";
import { moduleList } from "./dom.js";
import { openModule } from "./navigation.js";

const OPENABLE_MODULE_CODES = [
  "pmo",
  "account",
  "account_console",
  "shift",
  "shiftbuilder"
];

function canShowModule(moduleCode, user) {
  const role = String(user?.role || "").trim().toLowerCase();

  if (moduleCode === "account") {
    return role === "admin" || role === "developer" || role === "dev";
  }

  if (moduleCode === "account_console") {
    return false;
  }

  return true;
}

function normalizeVisibleModules(modules) {
  if (!Array.isArray(modules)) {
    return [];
  }

  const uniqueModules = [];

  modules.forEach((moduleCode) => {
    if (!uniqueModules.includes(moduleCode)) {
      uniqueModules.push(moduleCode);
    }
  });

  return uniqueModules;
}

function canOpenModule(moduleCode) {
  return OPENABLE_MODULE_CODES.includes(moduleCode);
}

export function renderModules(modules, user, setStatus) {
  moduleList.innerHTML = "";

  const visibleModules = normalizeVisibleModules(modules)
    .filter((moduleCode) => canShowModule(moduleCode, user));

  if (visibleModules.length === 0) {
    moduleList.innerHTML = "<div class='module-card'><div class='module-card-title'>利用可能モジュールなし</div></div>";
    return;
  }

  visibleModules.forEach((moduleCode) => {
    const card = document.createElement("div");
    card.className = "module-card";

    const title = document.createElement("div");
    title.className = "module-card-title";
    title.textContent = MODULE_NAME_MAP[moduleCode] || moduleCode;

    const code = document.createElement("div");
    code.className = "module-card-code";
    code.textContent = "module_code: " + moduleCode;

    const button = document.createElement("button");

    if (canOpenModule(moduleCode)) {
      button.textContent = "開く";
      button.addEventListener("click", () => openModule(moduleCode, setStatus));
    } else {
      button.textContent = "準備中";
      button.disabled = true;
    }

    card.appendChild(title);
    card.appendChild(code);
    card.appendChild(button);
    moduleList.appendChild(card);
  });
}
