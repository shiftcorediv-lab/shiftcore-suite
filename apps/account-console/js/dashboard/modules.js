import { MODULE_NAME_MAP } from "./config.js";
import { moduleList } from "./dom.js";
import { openModule } from "./navigation.js";

const OPENABLE_MODULE_MAP = {
  pmo: true,
  account: true,
  account_console: true,
  shift: true,
  shiftbuilder: true,
  ordercase: true,
  order_case: true
};

function canShowModule(moduleCode, user) {
  const role = String((user && user.role) || "").trim().toLowerCase();

  if (moduleCode === "account") {
    return role === "admin" || role === "developer" || role === "dev";
  }

  if (moduleCode === "account_console") {
    return false;
  }

  return true;
}

function canOpenModule(moduleCode) {
  return OPENABLE_MODULE_MAP[moduleCode] === true;
}

export function renderModules(modules, user, setStatus) {
  if (!moduleList) {
    return;
  }

  moduleList.innerHTML = "";

  const sourceModules = Array.isArray(modules) ? modules : [];
  const visibleModules = [];

  sourceModules.forEach(function(moduleCode) {
    const normalizedModuleCode = String(moduleCode || "").trim();

    if (!normalizedModuleCode) {
      return;
    }

    if (visibleModules.includes(normalizedModuleCode)) {
      return;
    }

    if (!canShowModule(normalizedModuleCode, user)) {
      return;
    }

    visibleModules.push(normalizedModuleCode);
  });

  if (visibleModules.length === 0) {
    moduleList.innerHTML = "<div class='module-card'><div class='module-card-title'>利用可能モジュールなし</div></div>";
    return;
  }

  visibleModules.forEach(function(moduleCode) {
    const card = document.createElement("div");
    const title = document.createElement("div");
    const code = document.createElement("div");
    const button = document.createElement("button");

    card.className = "module-card";

    title.className = "module-card-title";
    title.textContent = MODULE_NAME_MAP[moduleCode] || moduleCode;

    code.className = "module-card-code";
    code.textContent = "module_code: " + moduleCode;

    if (canOpenModule(moduleCode)) {
      button.textContent = "開く";
      button.addEventListener("click", function() {
        openModule(moduleCode, setStatus);
      });
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
