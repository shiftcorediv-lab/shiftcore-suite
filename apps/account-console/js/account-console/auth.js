import { requireAuthenticatedSession } from "../common/auth-session.js";
import { LOGIN_URL } from "./config.js";

// ===== 認証セッション確認ここから =====
export async function requireAccountConsoleSession() {
  const session = await requireAuthenticatedSession();

  if (!session.ok) {
    window.location.href = LOGIN_URL;
    return null;
  }

  return session;
}
// ===== 認証セッション確認ここまで =====
