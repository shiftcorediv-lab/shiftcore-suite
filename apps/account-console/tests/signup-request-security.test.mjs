import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const signupSource = readFileSync(
  new URL("../backend/account-apps-script/signup_request.js", import.meta.url),
  "utf8"
);
const apiSource = readFileSync(
  new URL("../backend/account-apps-script/api.js", import.meta.url),
  "utf8"
);
const browserApiSource = readFileSync(
  new URL("../js/signup-request/api.js", import.meta.url),
  "utf8"
);
const browserMainSource = readFileSync(
  new URL("../js/signup-request/main.js", import.meta.url),
  "utf8"
);

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function createContext() {
  const cache = new Map();
  const context = vm.createContext({
    normalizeText,
    SIGNUP_REQUEST_RATE_LIMIT: 5,
    SIGNUP_REQUEST_RATE_LIMIT_SECONDS: 3600,
    CacheService: {
      getScriptCache: () => ({
        get: key => cache.get(key) || null,
        put: (key, value) => cache.set(key, value)
      })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (_algorithm, value) => Array.from(String(value), char => char.charCodeAt(0) % 256)
    },
    console
  });
  vm.runInContext(signupSource, context);
  return context;
}

test("登録申請APIはFirebase IDトークンから確認したメールだけを使用する", () => {
  const branch = apiSource.slice(
    apiSource.indexOf('if (action === "submitSignupRequest")'),
    apiSource.indexOf('if (action === "getSignupRequestsSecure")')
  );
  assert.match(branch, /resolveFirebaseEmailByIdToken_\(body\.idToken\)/);
  assert.match(branch, /tokenResult\.emailVerified !== true/);
  assert.match(branch, /submitSignupRequest\(body\.payload \|\| body, tokenResult\.email\)/);
  assert.ok(branch.indexOf("resolveFirebaseEmailByIdToken_") < branch.indexOf("submitSignupRequest("));
  assert.match(browserApiSource, /idToken,/);
  assert.match(browserMainSource, /authenticatedUser\.getIdToken\(\)/);
  assert.doesNotMatch(browserMainSource, /sessionStorage/);
});

test("登録申請は申告メールと認証済みメールの不一致を拒否する", () => {
  const context = createContext();
  const result = context.validateSignupPayload_({
    applicantEmail: "other@example.com",
    applicantName: "申請者",
    applicantType: "employee",
    phone: "09000000000"
  }, "person@example.com");
  assert.equal(result.success, false);
  assert.equal(result.code, "SIGNUP_EMAIL_MISMATCH");
});

test("登録申請は同一認証メールの受付試行を1時間5回までに制限する", () => {
  const context = createContext();
  for (let index = 0; index < 5; index += 1) {
    assert.equal(context.consumeSignupRequestRateLimit_("person@example.com"), true);
  }
  assert.equal(context.consumeSignupRequestRateLimit_("person@example.com"), false);
  assert.equal(context.consumeSignupRequestRateLimit_("other@example.com"), true);
});

test("登録申請のシート値は数式として評価されない", () => {
  const context = createContext();
  for (const value of ["=IMPORTXML()", "+1+1", "-1+1", "@SUM(A1:A2)"]) {
    assert.equal(context.escapeSignupSpreadsheetValue_(value), `'${value}`);
  }
  assert.equal(context.escapeSignupSpreadsheetValue_("山田太郎"), "山田太郎");
  assert.equal(context.escapeSignupSpreadsheetValue_(false), false);
});
