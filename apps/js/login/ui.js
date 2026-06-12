import { loginBtn, statusBox } from "./dom.js";

export function setStatus(message) {
  statusBox.textContent = message;
}

export function showLoggedOutState(message = "未ログイン") {
  loginBtn.style.display = "block";
  setStatus(message);
}

export function showLoginProcessingState(message) {
  loginBtn.style.display = "block";
  setStatus(message);
}
