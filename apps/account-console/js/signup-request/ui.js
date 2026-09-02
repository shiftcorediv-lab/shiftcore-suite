import { emailBox, messageBox } from "./dom.js";
import { setActivity } from "../common/activity.js";

export function setEmailBox(email, type = "") {
  setActivity(emailBox, false, email || "メールアドレスを取得できませんでした");
  emailBox.className = "info-box";
  if (type) {
    emailBox.classList.add(type);
  }
}

export function showMessage(text, type = "") {
  messageBox.textContent = text;
  messageBox.className = "message";
  if (type) {
    messageBox.classList.add(type);
  }
}
