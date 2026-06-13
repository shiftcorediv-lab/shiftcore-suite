// ===== ShiftBuilder API client ここから =====

import { SHIFTBUILDER_API_URL } from "./config.js";


// ===== API共通POSTここから =====
async function postToShiftBuilderApi(action, body = {}) {
  const payload = {
    ...body,
    action: action
  };

  const response = await fetch(SHIFTBUILDER_API_URL, {
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


// ===== 疎通確認ここから =====
export async function pingShiftBuilderApi() {
  return postToShiftBuilderApi("shiftBuilderPing");
}
// ===== 疎通確認ここまで =====


// ===== 現在ユーザー取得ここから =====
export async function getCurrentShiftBuilderUser(idToken) {
  return postToShiftBuilderApi("shiftBuilderGetCurrentUser", {
    idToken: idToken
  });
}
// ===== 現在ユーザー取得ここまで =====


// ===== ShiftBuilder API client ここまで =====
