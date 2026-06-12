import {
  nameText,
  emailText,
  roleText,
  organizationText,
  statusBox
} from "./dom.js";
import { renderModules } from "./modules.js";

export function setStatus(message) {
  statusBox.textContent = message;
}

export function renderUser(user) {
  nameText.textContent = user.name || "";
  emailText.textContent = user.email || "";
  roleText.textContent = user.role || "";
  organizationText.textContent = user.organization_id || "";

  renderModules(user.allowed_modules || [], user, setStatus);
}
