// ===== ShiftBuilder auth.js ここから =====

import { LOGIN_URL } from "./config.js?v=20260801-authfix-1";
import {
  getShiftCoreAuth,
  getShiftCoreSession
} from "../../../../shared/js/shiftcore-auth.js?v=20260801-authfix-1";

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

// ===== ShiftBuilder auth.js ここまで =====
