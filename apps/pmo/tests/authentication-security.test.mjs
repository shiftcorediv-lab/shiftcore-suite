import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const authSource = readFileSync(
  new URL("../backend/pmo-apps-script/auth_guard.gs.js", import.meta.url),
  "utf8"
);
const requestSource = readFileSync(
  new URL("../backend/pmo-apps-script/request.js", import.meta.url),
  "utf8"
);
const apiSource = readFileSync(
  new URL("../backend/pmo-apps-script/api.js", import.meta.url),
  "utf8"
);
const frontendMainSource = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
const frontendRequestSource = readFileSync(new URL("../js/request.js", import.meta.url), "utf8");
const frontendUiSource = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");

function createContext() {
  const context = vm.createContext({
    normalizeText: (value) => String(value == null ? "" : value).trim(),
    console
  });
  vm.runInContext(authSource, context);
  vm.runInContext(requestSource, context);
  return context;
}

function activeUser(overrides = {}) {
  return {
    internal_user_id: "U-SELF",
    name: "本人",
    employee_code: "AN0001",
    role: "member",
    status: "active",
    work_status: "on",
    email: "self@example.com",
    ...overrides
  };
}

test("PMO本人APIは未認証・停止中・非稼働をサーバー側で拒否する", () => {
  const context = createContext();

  context.resolveShiftCoreCurrentUserByIdToken_ = () => ({
    ok: false,
    code: "ID_TOKEN_REQUIRED",
    message: "idToken が必要です"
  });
  assert.equal(context.requirePmoActiveUser_("").success, false);

  context.resolveShiftCoreCurrentUserByIdToken_ = () => ({
    ok: false,
    code: "USER_STOPPED",
    message: "このユーザーは停止中です"
  });
  assert.equal(context.requirePmoActiveUser_("stopped-token").code, "USER_STOPPED");

  context.resolveShiftCoreCurrentUserByIdToken_ = () => ({ ok: true, user: activeUser({ work_status: "off" }) });
  assert.equal(context.requirePmoActiveUser_("off-token").code, "PMO_USER_INACTIVE");
});

test("提出済み希望休の読取はbodyの他人IDを使わず認証本人へ固定する", () => {
  const context = createContext();
  let capturedUserId = "";
  context.resolveShiftCoreCurrentUserByIdToken_ = () => ({ ok: true, user: activeUser() });
  context.getLatestShiftRequest = (userId) => {
    capturedUserId = userId;
    return { success: true, exists: false };
  };

  const result = context.getLatestShiftRequestSecure("2026-10", "valid-token", "U-OTHER");
  assert.equal(result.success, true);
  assert.equal(capturedUserId, "U-SELF");
});

test("希望休提出はbodyのID・氏名・社員コードを捨て認証本人で保存する", () => {
  const context = createContext();
  let capturedPayload = null;
  context.resolveShiftCoreCurrentUserByIdToken_ = () => ({ ok: true, user: activeUser() });
  context.submitShiftRequest = (payload) => {
    capturedPayload = payload;
    return { success: true };
  };

  const result = context.submitShiftRequestSecure({
    userId: "U-OTHER",
    displayName: "他人",
    employeeCode: "AN9999",
    targetYearMonth: "2026-10",
    offDates: ["2026-10-01"],
    memo: "memo",
    submitType: "希望休あり"
  }, "valid-token");

  assert.equal(result.success, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(capturedPayload)),
    {
      userId: "U-SELF",
      displayName: "本人",
      employeeCode: "AN0001",
      targetYearMonth: "2026-10",
      offDates: ["2026-10-01"],
      memo: "memo",
      submitType: "希望休あり"
    }
  );
});

test("PMO公開入口とフロントは本人APIをIDトークン付きPOSTだけで呼ぶ", () => {
  assert.doesNotMatch(apiSource, /action === "getLatestShiftRequest"/);
  assert.doesNotMatch(apiSource, /action === "submitShiftRequest"/);
  assert.match(apiSource, /action === "getLatestShiftRequestSecure"/);
  assert.match(apiSource, /action === "submitShiftRequestSecure"/);
  assert.match(frontendMainSource, /requireAuthenticatedSession/);
  assert.doesNotMatch(frontendMainSource, /buildCurrentUserFromQuery/);
  assert.match(frontendRequestSource, /apiPost\("getLatestShiftRequestSecure"/);
  assert.match(frontendRequestSource, /apiPost\("submitShiftRequestSecure"/);
  assert.doesNotMatch(frontendRequestSource, /userId:\s*currentUser\.userId/);
  assert.doesNotMatch(frontendUiSource, /payload\.(?:displayName|employeeCode)/);
});
