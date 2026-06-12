export function saveLoginSession(loginCheck) {
  sessionStorage.setItem("shiftcore_user", JSON.stringify(loginCheck.user));
}

export function clearLoginSession() {
  sessionStorage.removeItem("shiftcore_user");
}

export function saveSignupEmail(email) {
  sessionStorage.setItem("shiftcore_signup_email", String(email || "").trim().toLowerCase());
}

export function clearSignupEmail() {
  sessionStorage.removeItem("shiftcore_signup_email");
}
