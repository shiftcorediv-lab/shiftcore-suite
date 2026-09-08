import { auth } from "./auth.js";
import { ATTENDANCE_API_URL } from "./config.js?v=20260802-attendance-2";

export async function attendanceRequest(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログイン状態を確認できません。再ログインしてください。");
  if (!ATTENDANCE_API_URL.startsWith("https://")) throw new Error("勤怠APIがまだ公開されていません。");
  for (let attempt = 0; attempt < 2; attempt++) {
  if (auth.currentUser?.uid !== user.uid) throw new Error("ログインしたアカウントが変わりました。画面を再読み込みしてください。");
  let idToken;
  try { idToken = await user.getIdToken(attempt > 0); }
  catch (error) {
    if (["auth/user-token-expired", "auth/invalid-user-token", "auth/user-disabled"].includes(error.code)) throw new Error("ログインし直してから操作してください。今回の操作は送信していません。");
    throw new Error("本人確認に接続できません。通信状況を確認して、もう一度押してください。今回の操作は送信していません。");
  }
  if (auth.currentUser?.uid !== user.uid) throw new Error("ログインしたアカウントが変わりました。画面を再読み込みしてください。");
  const response = await fetch(ATTENDANCE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, idToken, payload })
  });
  const result = await response.json();
  // このコードは保存前の本人確認だけが返す。通信切断や一般エラーは再送しない。
  if (result.code === "AUTH_REFRESH_REQUIRED" && !result.ok && attempt === 0) continue;
  if (!result.ok) {
    const error = new Error(result.message || "処理に失敗しました。");
    error.code = result.code;
    throw error;
  }
  return result;
  }
}
