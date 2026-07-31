// ===== ShiftCore Shared Auth ここから =====

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./shiftcore-firebase-config.js?v=20260801-authfix-1";
import {
  AUTH_STATE_TIMEOUT_MS,
  buildSignedInSession,
  buildSignedOutSession,
  describeAuthFailure
} from "./shiftcore-auth-policy.mjs?v=20260801-authfix-1";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export function getShiftCoreAuth() {
  return auth;
}

export function waitForShiftCoreAuthState({ timeoutMs = AUTH_STATE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = null;
    let timerId = null;

    const settle = (session) => {
      if (settled) {
        return;
      }
      settled = true;

      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }

      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (error) {
          // 購読解除の失敗は認証結果へ影響させない。
        }
      }

      resolve(session);
    };

    timerId = setTimeout(() => {
      settle(buildSignedOutSession("認証状態の確認がタイムアウトしました。"));
    }, timeoutMs);

    try {
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (!user) {
            settle(buildSignedOutSession());
            return;
          }

          // asyncコールバックにせず、同期例外とPromise拒否を両方settleへ戻す。
          try {
            Promise.resolve(user.getIdToken()).then(
              (idToken) => {
                settle(buildSignedInSession(user, idToken));
              },
              (error) => {
                settle(buildSignedOutSession(
                  describeAuthFailure(error, "IDトークンを取得できませんでした。")
                ));
              }
            );
          } catch (error) {
            settle(buildSignedOutSession(
              describeAuthFailure(error, "IDトークンを取得できませんでした。")
            ));
          }
        },
        (error) => {
          settle(buildSignedOutSession(
            describeAuthFailure(error, "認証状態を確認できませんでした。")
          ));
        }
      );
    } catch (error) {
      settle(buildSignedOutSession(
        describeAuthFailure(error, "認証状態を確認できませんでした。")
      ));
    }

    // 同期発火時はsettle後にunsubscribeが代入されるため、ここで解除する。
    if (settled && typeof unsubscribe === "function") {
      try {
        unsubscribe();
      } catch (error) {
        // 購読解除の失敗は認証結果へ影響させない。
      }
    }
  });
}

export async function getShiftCoreSession() {
  return await waitForShiftCoreAuthState();
}

// ===== ShiftCore Shared Auth ここまで =====
