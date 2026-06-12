import { auth, signOut, onAuthStateChanged } from "./auth.js";
import { logoutBtn, backToLoginBtn } from "./dom.js";
import { getStoredUser, clearStoredUser } from "./storage.js";
import { goToLogin } from "./navigation.js";
import { renderUser, setStatus } from "./ui.js";

const storedUser = getStoredUser();

if (!storedUser) {
  setStatus("セッション情報がありません。ログイン画面へ戻ります。");
  setTimeout(goToLogin, 800);
} else {
  console.log("storedUser", storedUser);
  console.log("pmoV2Url", storedUser.pmoV2Url);
  renderUser(storedUser);
  setStatus("ログイン済みユーザー情報を表示中");
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    clearStoredUser();
    setStatus("ログイン状態が失われました。ログイン画面へ戻ります。");
    setTimeout(goToLogin, 800);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    clearStoredUser();
    goToLogin();
  } catch (error) {
    setStatus("ログアウトエラー\n\n" + error.message);
  }
});

backToLoginBtn.addEventListener("click", () => {
  goToLogin();
});
