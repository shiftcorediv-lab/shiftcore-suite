// ===== ShiftCore Shared Auth ここから =====

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./shiftcore-firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export function getShiftCoreAuth() {
  return auth;
}

export function waitForShiftCoreAuthState() {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (settled) return;
      settled = true;
      unsubscribe();

      if (!user) {
        resolve({
          isLoggedIn: false,
          user: null,
          idToken: null,
          email: "",
          uid: ""
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

export async function getShiftCoreSession() {
  return await waitForShiftCoreAuthState();
}

// ===== ShiftCore Shared Auth ここまで =====
