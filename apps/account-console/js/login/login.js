import { auth, signOut } from "./auth.js";
import { DASHBOARD_URL, SIGNUP_REQUEST_URL } from "./config.js";
import { checkUserWithGas } from "./api.js";
import { saveLoginSession, clearLoginSession, saveSignupEmail, clearSignupEmail } from "./storage.js";
import { setStatus, showLoggedOutState } from "./ui.js";

export async function verifySignedInUser(user) {
  if (!user || !user.email) {
    clearLoginSession();
    clearSignupEmail();
    showLoggedOutState("未ログイン");
    return;
  }

  try {
    setStatus("アカウント照合中...");

    const loginCheck = await checkUserWithGas(user.email);

    if (loginCheck.ok) {
      clearSignupEmail();
      saveLoginSession(loginCheck);
      window.location.href = DASHBOARD_URL;
      return;
    }

    if (loginCheck.code === "USER_NOT_FOUND") {
      clearLoginSession();
      saveSignupEmail(user.email);
      window.location.href = SIGNUP_REQUEST_URL;
      return;
    }

    clearLoginSession();
    clearSignupEmail();
    await signOut(auth);
    showLoggedOutState(
      "ログイン不可\n\n" +
      "code: " + loginCheck.code + "\n" +
      "message: " + loginCheck.message
    );
  } catch (error) {
    clearLoginSession();
    clearSignupEmail();
    showLoggedOutState("エラー\n\n" + error.message);
  }
}
