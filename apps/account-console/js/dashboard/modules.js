import { MODULE_NAME_MAP, MODULE_DESCRIPTION_MAP } from "./config.js?v=20260802-reorder-1";
import { moduleList, userModuleList } from "./dom.js";
import { openModule } from "./navigation.js?v=20260803-role-1";
import { getEffectiveModuleCodes } from "../common/access-policy.mjs?v=20260812-developer-1";

export function getEffectiveModules(modules, user) {
  return getEffectiveModuleCodes(modules, user);
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
