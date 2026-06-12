import { SIGNUP_REQUEST_API_URL } from "./config.js";

export async function submitSignupRequest(payload) {
  const response = await fetch(SIGNUP_REQUEST_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "submitSignupRequest",
      payload
    })
  });

  if (!response.ok) {
    throw new Error("利用申請の送信に失敗しました: " + response.status);
  }

  return await response.json();
}
