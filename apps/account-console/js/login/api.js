import { LOGIN_CHECK_URL } from "./config.js";

export async function resolveCurrentUserWithGasByIdToken(idToken) {
  // 完了済みの本人情報は保存せず、同時進行の同一要求だけを共有する。
  const key = Symbol.for("another-portal.identity-in-flight");
  const requests = globalThis[key] || (globalThis[key] = new Map());
  const requestKey = LOGIN_CHECK_URL + ":" + idToken;
  if (requests.has(requestKey)) return requests.get(requestKey);
  const pending = requestCurrentUser(idToken);
  requests.set(requestKey, pending);
  try { return await pending; }
  finally { if (requests.get(requestKey) === pending) requests.delete(requestKey); }
}

async function requestCurrentUser(idToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
  const response = await fetch(LOGIN_CHECK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    signal: controller.signal,
    body: JSON.stringify({
      action: "resolveCurrentUserByIdToken",
      idToken: idToken
    })
  });

  const result = await response.json();
  return result;
  } finally { clearTimeout(timeout); }
}
