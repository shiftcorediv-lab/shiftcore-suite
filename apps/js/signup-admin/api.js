import { SIGNUP_ADMIN_API_URL } from "./config.js";

export async function fetchSignupRequests(status = "pending_approval") {
  const url = new URL(SIGNUP_ADMIN_API_URL);
  url.searchParams.set("action", "getSignupRequests");
  url.searchParams.set("status", status);

  const response = await fetch(url.toString(), {
    method: "GET"
  });

  if (!response.ok) {
    throw new Error("申請一覧の取得に失敗しました: " + response.status);
  }

  return await response.json();
}

export async function approveSignupRequest(requestId, approval, reviewedBy) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "approveSignupRequest",
      requestId,
      approval,
      reviewedBy
    })
  });

  if (!response.ok) {
    throw new Error("承認処理に失敗しました: " + response.status);
  }

  return await response.json();
}

export async function rejectSignupRequest(requestId, reviewedBy) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "rejectSignupRequest",
      requestId,
      reviewedBy
    })
  });

  if (!response.ok) {
    throw new Error("却下処理に失敗しました: " + response.status);
  }

  return await response.json();
}
