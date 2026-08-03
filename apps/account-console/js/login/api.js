import { LOGIN_CHECK_URL } from "./config.js";

export async function resolveCurrentUserWithGasByIdToken(idToken) {
  const response = await fetch(LOGIN_CHECK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "resolveCurrentUserByIdToken",
      idToken: idToken
    })
  });

  const result = await response.json();
  return result;
}
