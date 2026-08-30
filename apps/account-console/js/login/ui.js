import { loginBtn, statusBox } from "./dom.js";
import { setActivity } from "../common/activity.js?v=20260831-activity-1";

export function setStatus(message, loading = false) {
  setActivity(statusBox, loading, message);
}

export function showLoggedOutState(message = "未ログイン") {
  loginBtn.style.display = "block";
  setStatus(message);
}

export function showLoginProcessingState(message) {
  loginBtn.style.display = "block";
  setStatus(message, true);
}
