// ===== ShiftBuilder auth.js ここから =====

import { LOGIN_URL } from "./config.js?v=20260807-shadow-1";
import {
  getShiftCoreAuth,
  getShiftCoreSession
} from "../../../../shared/js/shiftcore-auth.js?v=20260801-authfix-1";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function getShiftBuilderAuth() {
  return getShiftCoreAuth();
}

export function getLoginUrl() {
  return LOGIN_URL;
}

export async function requireShiftBuilderSession() {
  const session = await getShiftCoreSession();

  // デバッグ中は自動リダイレクトしない。
  // 未ログインなら main.js 側で画面に表示する。
  return session;
}

export async function logoutShiftBuilder() {
  await signOut(getShiftBuilderAuth());

  try {
    sessionStorage.removeItem("shiftcore_user");
  } catch (_) {
    // Storageが利用できない場合もFirebaseのログアウト結果を優先する。
  }

  window.location.assign(getLoginUrl());
}

// ===== ShiftBuilder auth.js ここまで =====
