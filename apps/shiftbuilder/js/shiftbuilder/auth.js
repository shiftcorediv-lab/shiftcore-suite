// ===== ShiftBuilder auth.js ここから =====

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig, LOGIN_URL } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export function getShiftBuilderAuth() {
  return auth;
}

export function getLoginUrl() {
  return LOGIN_URL;
}

export function waitForAuthState() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        resolve({
          isLoggedIn: false,
          user: null,
          idToken: null,
          email: null,
          uid: null
        });
        return;
      }

      const idToken = await user.getIdToken();

      resolve({
        isLoggedIn: true,
        user,
        idToken,
        email: user.email || "",
        uid: user.uid || ""
      });
    });
  });
}

export async function requireShiftBuilderSession() {
  const session = await waitForAuthState();

  // デバッグ中は自動リダイレクトしない。
  // 未ログインなら main.js 側で画面に表示する。
  return session;
}

// ===== ShiftBuilder auth.js ここまで =====
