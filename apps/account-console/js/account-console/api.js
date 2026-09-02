import { ACCOUNT_API_URL } from "./config.js?v=20260810-org-shadow-1";

const INVALID_RESPONSE_MESSAGE =
  "メンバー情報を一時的に取得できませんでした。少し待ってから再読み込みしてください。";
const READ_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;

function parseAccountApiResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(INVALID_RESPONSE_MESSAGE);
    error.code = "ACCOUNT_API_INVALID_RESPONSE";
    error.retryable = true;
    throw error;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// ===== API共通POSTここから =====
async function postToAccountApi(action, body = {}, options = {}) {
  const payload = {
    ...body,
    action: action
  };

  const retries = Number.isInteger(options.retries) ? Math.max(0, options.retries) : 0;

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(ACCOUNT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      return parseAccountApiResponse(await response.text());
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error(INVALID_RESPONSE_MESSAGE);
        timeoutError.code = "ACCOUNT_API_TIMEOUT";
        timeoutError.retryable = true;
        error = timeoutError;
      }
      if (error?.retryable !== true || attempt >= retries) throw error;
      await wait(READ_RETRY_DELAY_MS);
    } finally {
      clearTimeout(timeoutId);
    }
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


// ===== 初期表示データ取得ここから =====
export async function getAccountConsoleBootstrap(idToken) {
  return postToAccountApi("accountConsoleGetBootstrap", {
    idToken: idToken
  }, { retries: 1 });
}
// ===== 初期表示データ取得ここまで =====


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

export async function getOrganizationAssignment(idToken, targetUserId) {
  return postToAccountApi("accountConsoleGetOrganizationAssignment", {
    idToken: idToken,
    target_internal_user_id: targetUserId
  });
}

export async function updateOrganizationAssignment(idToken, organization) {
  return postToAccountApi("accountConsoleUpdateOrganizationAssignment", {
    idToken: idToken,
    payload: organization
  });
}


// ===== 変更履歴取得ここから =====
export async function getAccountLogs(idToken, targetUserId = "") {
  return postToAccountApi("accountConsoleGetLogs", {
    idToken: idToken,
    targetUserId: targetUserId
  });
}
// ===== 変更履歴取得ここまで =====
