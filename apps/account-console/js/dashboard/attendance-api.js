import { auth } from "./auth.js";
import { ATTENDANCE_API_URL } from "./config.js?v=20260802-attendance-2";

export async function attendanceRequest(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログイン状態を確認できません。再ログインしてください。");
  if (!ATTENDANCE_API_URL.startsWith("https://")) throw new Error("勤怠APIがまだ公開されていません。");
  // 予定同期（refresh）には書き込みがあるため、名前の前方一致では許可しない。
  const retryableRead = ["getDashboardData", "getMyWorkReportSummary"].includes(action);
  let refreshToken = false;
  for (let attempt = 0; attempt < 2; attempt++) {
  if (auth.currentUser?.uid !== user.uid) throw new Error("ログインしたアカウントが変わりました。画面を再読み込みしてください。");
  let idToken;
  try { idToken = await user.getIdToken(refreshToken); }
  catch (error) {
    if (["auth/user-token-expired", "auth/invalid-user-token", "auth/user-disabled"].includes(error.code)) throw new Error("ログインし直してから操作してください。今回の操作は送信していません。");
    throw new Error("本人確認に接続できません。通信状況を確認して、もう一度押してください。今回の操作は送信していません。");
  }
  if (auth.currentUser?.uid !== user.uid) throw new Error("ログインしたアカウントが変わりました。画面を再読み込みしてください。");
  // 読み取りだけ待機を打ち切る。サーバー側の処理を止めた保証はないため、時間切れは自動再送しない。
  const readController = retryableRead ? new AbortController() : null;
  const readTimeout = readController ? setTimeout(() => readController.abort(), 60000) : null;
  const timeoutError = () => Object.assign(new Error("読み込みに時間がかかっています。少し待ってから画面を再読み込みしてください。"), { code: "API_READ_TIMEOUT" });
  let response;
  try { response = await fetch(ATTENDANCE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, idToken, payload }),
    ...(readController ? { signal: readController.signal } : {})
  }); } catch (_) {
    if (readTimeout !== null) clearTimeout(readTimeout);
    if (readController?.signal.aborted) throw timeoutError();
    if (retryableRead && attempt === 0) continue;
    // 応答が届かなくてもサーバー側では保存済みの場合がある。自動再送しない。
    const error = new Error("サーバーに接続できませんでした。通信状況を確認して、画面を更新してください。");
    error.code = "API_NETWORK_ERROR";
    if (!/^(get|refresh)/.test(action)) {
      error.message = "保存結果を確認できませんでした。保存済みの可能性があります。再送せず、画面を更新して記録を確認してください。確認できない場合は上席へ連絡してください。";
      error.code = "SAVE_RESULT_UNKNOWN";
    }
    throw error;
  }
  let result;
  try { result = await response.json(); }
  catch (_) {
    if (readController?.signal.aborted) throw timeoutError();
    if (retryableRead && attempt === 0) continue;
    const error = new Error(retryableRead ? "情報を読み込めませんでした。少し待ってから画面を更新してください。" : "サーバーの応答を確認できませんでした。保存操作の場合は結果が不明です。再送せず、画面を更新して記録を確認してください。");
    error.code = "INVALID_API_RESPONSE";
    throw error;
  } finally {
    if (readTimeout !== null) clearTimeout(readTimeout);
  }
  if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
    if (retryableRead && attempt === 0) continue;
    const error = new Error(retryableRead ? "情報を読み込めませんでした。少し待ってから画面を更新してください。" : "サーバーから正しい応答が届きませんでした。保存操作の場合は再送せず、画面を更新して記録を確認してください。");
    error.code = "INVALID_API_RESPONSE";
    throw error;
  }
  // このコードは保存前の本人確認だけが返す。通信切断や一般エラーは再送しない。
  if (result.code === "AUTH_REFRESH_REQUIRED" && !result.ok && attempt === 0) {
    refreshToken = true;
    continue;
  }
  if (!result.ok) {
    const error = new Error(result.message || "処理に失敗しました。");
    error.code = result.code;
    throw error;
  }
  return result;
  }
}
