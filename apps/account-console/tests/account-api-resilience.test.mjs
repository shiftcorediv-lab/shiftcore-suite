import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalWindow = globalThis.window;

globalThis.window = {
  ShiftCoreEnvironment: {
    endpoint(_name, fallback) {
      return fallback;
    }
  }
};

const {
  createAccountUser,
  getAccountConsoleBootstrap
} = await import(`../js/account-console/api.js?test=${Date.now()}`);

function response(text) {
  return { text: async () => text };
}

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.window = originalWindow;
});

test("初期読込は一時的なHTML応答の後に一度だけ再試行する", async () => {
  const responses = [
    response("<!doctype html><html><body>Google Drive error</body></html>"),
    response(JSON.stringify({ ok: true, users: [] }))
  ];
  let callCount = 0;
  globalThis.fetch = async () => responses[callCount++];
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };

  const result = await getAccountConsoleBootstrap("token");

  assert.equal(callCount, 2);
  assert.deepEqual(result, { ok: true, users: [] });
});

test("HTML応答が続いても本文をエラーメッセージへ露出しない", async () => {
  const html = "<!doctype html><html><body>Google Drive error</body></html>";
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return response(html);
  };
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };

  await assert.rejects(
    getAccountConsoleBootstrap("token"),
    (error) => {
      assert.equal(error.code, "ACCOUNT_API_INVALID_RESPONSE");
      assert.match(error.message, /少し待ってから再読み込みしてください/);
      assert.doesNotMatch(error.message, /doctype|Google Drive error/i);
      return true;
    }
  );
  assert.equal(callCount, 2);
});

test("保存系は不正応答でも自動再送しない", async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return response("<html>temporary error</html>");
  };

  await assert.rejects(createAccountUser("token", { name: "テスト" }), {
    code: "ACCOUNT_API_INVALID_RESPONSE"
  });
  assert.equal(callCount, 1);
});
