export const AUTH_STATE_TIMEOUT_MS = 15000;

export function buildSignedOutSession(authError = "") {
  return {
    isLoggedIn: false,
    user: null,
    idToken: null,
    email: "",
    uid: "",
    authError: authError || ""
  };
}

export function buildSignedInSession(user, idToken) {
  return {
    isLoggedIn: true,
    user: user,
    idToken: idToken,
    email: user?.email || "",
    uid: user?.uid || "",
    authError: ""
  };
}

export function describeAuthFailure(error, fallback) {
  const source = typeof error === "string" ? error : error?.message;
  const message = String(source || "").trim();

  return message || fallback;
}
