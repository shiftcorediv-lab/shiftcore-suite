// ===== ShiftBuilder auth ここから =====

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  firebaseConfig,
  LOGIN_URL
} from "./config.js";


// ===== Firebase初期化ここから =====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// ===== Firebase初期化ここまで =====


// ===== ログインセッション取得ここから =====
export function requireShiftBuilderSession() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          window.location.href = LOGIN_URL;
          resolve(null);
          return;
        }

        const idToken = await user.getIdToken(true);

        resolve({
          firebaseUser: user,
          idToken: idToken,
          email: user.email || "",
          uid: user.uid || ""
        });

      } catch (error) {
        reject(error);
      }
    });
  });
}
// ===== ログインセッション取得ここまで =====


// ===== ShiftBuilder auth ここまで =====
