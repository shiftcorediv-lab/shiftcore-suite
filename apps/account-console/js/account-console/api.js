import { ACCOUNT_API_URL } from "./config.js";

// ===== API共通POSTここから =====
async function postToAccountApi(action, body = {}) {
  const payload = {
    ...body,
    action: action
  };

  const response = await fetch(ACCOUNT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("APIレスポンスのJSON解析に失敗しました\n\n" + text);
  }
}
// ===== API共通POSTここまで =====


// ===== 現在ユーザー確認ここから =====
export async function getCurrentAccountConsoleUser(idToken) {
  return postToAccountApi("accountConsoleGetCurrentUser", {
    idToken: idToken
  });
}
// ===== 現在ユーザー確認ここまで =====


// ===== ユーザー一覧取得ここから =====
export async function listAccountUsers(idToken) {
  return postToAccountApi("accountConsoleListUsers", {
    idToken: idToken
  });
}
// ===== ユーザー一覧取得ここまで =====


// ===== ユーザー作成ここから =====
export async function createAccountUser(idToken, user) {
  return postToAccountApi("accountConsoleCreateUser", {
    idToken: idToken,
    payload: user
  });
}
// ===== ユーザー作成ここまで =====


// ===== ユーザー更新ここから =====
export async function updateAccountUser(idToken, user) {
  return postToAccountApi("accountConsoleUpdateUser", {
    idToken: idToken,
    payload: user
  });
}
// ===== ユーザー更新ここまで =====


// ===== 変更履歴取得ここから =====
export async function getAccountLogs(idToken, targetUserId = "") {
  return postToAccountApi("accountConsoleGetLogs", {
    idToken: idToken,
    targetUserId: targetUserId
  });
}
// ===== 変更履歴取得ここまで =====
