import { GAS_API_URL } from "./config.js";

export async function apiGet(action, params = {}) {
  const url = new URL(GAS_API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET"
  });

  if (!response.ok) {
    throw new Error("GET APIに失敗しました: " + response.status);
  }

  return await response.json();
}

export async function apiPost(action, body = {}) {
  const response = await fetch(GAS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...body
    })
  });

  if (!response.ok) {
    throw new Error("POST APIに失敗しました: " + response.status);
  }

  return await response.json();
}
