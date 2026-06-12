import {
  auth,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "./auth.js";
import { loginBtn } from "./dom.js";
import { clearLoginSession } from "./storage.js";
import { showLoggedOutState, showLoginProcessingState } from "./ui.js";
import { verifySignedInUser } from "./login.js";

await setPersistence(auth, browserLocalPersistence);

loginBtn.addEventListener("click", async () => {
  try {
    showLoginProcessingState("Googleログイン中...");

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    await verifySignedInUser(user);
  } catch (error) {
    showLoggedOutState("エラー\n\n" + error.message);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await verifySignedInUser(user);
  } else {
    clearLoginSession();
    showLoggedOutState("未ログイン");
  }
});
