import { SIGNUP_ADMIN_API_URL } from "./config.js?v=20260803-role-1";

export async function fetchSignupRequests(status, idToken) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "getSignupRequestsSecure",
      status,
      idToken
    })
  });

  if (!response.ok) {
    throw new Error("申請一覧の取得に失敗しました: " + response.status);
  }

  return await response.json();
}

export async function approveSignupRequest(requestId, approval, idToken) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "approveSignupRequest",
      requestId,
      approval,
      idToken
    })
  });

  if (!response.ok) {
    throw new Error("承認処理に失敗しました: " + response.status);
  }

  return await response.json();
}

export async function rejectSignupRequest(requestId, idToken) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "rejectSignupRequest",
      requestId,
      idToken
    })
  });

  if (!response.ok) {
    throw new Error("却下処理に失敗しました: " + response.status);
  }

  return await response.json();
}
