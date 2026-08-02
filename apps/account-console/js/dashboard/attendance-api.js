import { auth } from "./auth.js";
import { ATTENDANCE_API_URL } from "./config.js";

export async function attendanceRequest(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログイン状態を確認できません。再ログインしてください。");
  if (!ATTENDANCE_API_URL.startsWith("https://")) throw new Error("勤怠APIがまだ公開されていません。");
  const idToken = await user.getIdToken();
  const response = await fetch(ATTENDANCE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, idToken, payload })
  });
  const result = await response.json();
  if (!result.ok) {
    const error = new Error(result.message || "処理に失敗しました。");
    error.code = result.code;
    throw error;
  }
  return result;
}
