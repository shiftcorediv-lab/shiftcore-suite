import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("developerはAccount Console・OrderCase・Shadow候補でも全権扱いにする", () => {
  const accountUsers = readFileSync(
    new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
    "utf8"
  );
  const authorization = readFileSync(
    new URL("../backend/account-apps-script/authorization.js", import.meta.url),
    "utf8"
  );
  const orderCase = readFileSync(
    new URL("../../ordercase/backend/ordercase-apps-script/Service_OrderCasePermissions.js", import.meta.url),
    "utf8"
  );

  assert.match(accountUsers, /role\)\.toLowerCase\(\) !== "developer"/);
  assert.match(authorization, /developer \? "all" : normalizeText\(user\.ordercase_permission\)/);
  assert.match(authorization, /developer \? "all" : normalizeText\(user\.shiftbuilder_permission\)/);
  assert.match(orderCase, /developer\s*\? ORDERCASE_PERMISSION_ALL/);
});

test("Account ConsoleはAN0000のうちログイン中developer本人だけを一覧へ含める", () => {
  const context = vm.createContext({});
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
      "utf8"
    ),
    context
  );

  const developer = { internal_user_id: "U-DEV1", role: "developer" };
  assert.equal(context.shouldIncludeAccountConsoleUser_(developer, {
    internal_user_id: "U-DEV1", employee_code: "AN0000"
  }), true);
  assert.equal(context.shouldIncludeAccountConsoleUser_(developer, {
    internal_user_id: "U-DEV2", employee_code: "AN0000"
  }), false);
  assert.equal(context.shouldIncludeAccountConsoleUser_(
    { internal_user_id: "U-ADMIN", role: "admin" },
    { internal_user_id: "U-ADMIN", employee_code: "AN0000" }
  ), false);
  assert.equal(context.shouldIncludeAccountConsoleUser_(developer, {
    internal_user_id: "U-1", employee_code: "AN0004"
  }), true);
});

test("申請承認経路もdeveloper新設ガードを通す", () => {
  const signupAdmin = readFileSync(
    new URL("../backend/account-apps-script/signup_admin.js", import.meta.url),
    "utf8"
  );
  const api = readFileSync(
    new URL("../backend/account-apps-script/api.js", import.meta.url),
    "utf8"
  );

  // 承認経路が素通りすると、非developerが自分で申請して自分で承認する
  // 自己昇格経路になる。Account Consoleの2経路だけ塞いでも不十分。
  assert.match(
    signupAdmin,
    /function approveSignupRequest\(requestId, approval, reviewedBy, operator\)/,
    "承認処理が操作者を受け取っていない"
  );
  assert.match(
    signupAdmin,
    /assertDeveloperAccountMutationAllowed_\(operator, "", role, ""\)/,
    "承認処理でdeveloper新設ガードを呼んでいない"
  );
  assert.match(
    api,
    /approveSignupRequest\(requestId, approval, operator\.operatorId, operator\.user\)/,
    "承認APIが操作者オブジェクトを渡していない"
  );
});

test("非developerの自己昇格とdeveloperアカウント変更を拒否する", () => {
  const context = vm.createContext({});
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
      "utf8"
    ),
    context
  );

  assert.throws(
    () => context.assertDeveloperAccountMutationAllowed_(
      { internal_user_id: "U-1", role: "member" },
      "member",
      "developer",
      "U-1"
    ),
    /DEVELOPER_ACCOUNT_MUTATION_FORBIDDEN/
  );
  assert.throws(
    () => context.assertDeveloperAccountMutationAllowed_(
      { internal_user_id: "U-1", role: "admin" },
      "developer",
      "developer",
      "U-DEV"
    ),
    /DEVELOPER_ACCOUNT_MUTATION_FORBIDDEN/
  );
});

test("developerは他のdeveloperを管理できるが自分のroleは変更できない", () => {
  const context = vm.createContext({});
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
      "utf8"
    ),
    context
  );

  assert.equal(
    context.assertDeveloperAccountMutationAllowed_(
      { internal_user_id: "U-DEV1", role: "developer" },
      "developer",
      "developer",
      "U-DEV2"
    ),
    true
  );
  assert.throws(
    () => context.assertDeveloperAccountMutationAllowed_(
      { internal_user_id: "U-DEV1", role: "developer" },
      "developer",
      "admin",
      "U-DEV1"
    ),
    /SELF_ROLE_CHANGE_FORBIDDEN/
  );
});

test("最後のactive developerは停止・降格できない", () => {
  const context = vm.createContext({});
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
      "utf8"
    ),
    context
  );

  const onlyDeveloper = [{ internal_user_id: "U-DEV1", role: "developer", status: "active" }];
  assert.throws(
    () => context.assertLastActiveDeveloperProtected_(
      onlyDeveloper,
      onlyDeveloper[0],
      { ...onlyDeveloper[0], status: "inactive" }
    ),
    /LAST_ACTIVE_DEVELOPER_PROTECTED/
  );
  assert.throws(
    () => context.assertLastActiveDeveloperProtected_(
      onlyDeveloper,
      onlyDeveloper[0],
      { ...onlyDeveloper[0], role: "admin" }
    ),
    /LAST_ACTIVE_DEVELOPER_PROTECTED/
  );

  const twoDevelopers = [
    ...onlyDeveloper,
    { internal_user_id: "U-DEV2", role: "developer", status: "active" }
  ];
  assert.equal(
    context.assertLastActiveDeveloperProtected_(
      twoDevelopers,
      twoDevelopers[0],
      { ...twoDevelopers[0], status: "inactive" }
    ),
    true
  );
  assert.equal(
    context.assertLastActiveDeveloperProtected_(
      onlyDeveloper,
      onlyDeveloper[0],
      { ...onlyDeveloper[0], memo: "変更" }
    ),
    true
  );
});

test("developerの付与・剥奪をハッシュ連鎖対象の権限監査ログへ記録する", () => {
  const calls = [];
  const context = vm.createContext({
    Utilities: { getUuid: () => "event-1" },
    appendAuthorizationChangeLog_: (entry) => calls.push(entry)
  });
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
      "utf8"
    ),
    context
  );

  const operator = { internal_user_id: "U-DEV", role: "developer" };
  const eventId = context.beginDeveloperAccountAuthorizationEvent_(
    operator,
    "member",
    "developer",
    "U-TARGET",
    "権限変更"
  );
  context.completeDeveloperAccountAuthorizationEvent_(
    eventId,
    operator,
    "member",
    "developer",
    "U-TARGET",
    "権限変更"
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(
    Array.from(calls, (entry) => [entry.event_type, entry.result]),
    [
      ["account.role.developer", "started"],
      ["account.role.developer", "success"]
    ]
  );
});

test("developerに触れないrole変更は権限監査ログへ記録しない", () => {
  const calls = [];
  const context = vm.createContext({
    Utilities: { getUuid: () => "unused" },
    appendAuthorizationChangeLog_: (entry) => calls.push(entry)
  });
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
      "utf8"
    ),
    context
  );

  assert.equal(
    context.beginDeveloperAccountAuthorizationEvent_(
      { internal_user_id: "U-ADMIN", role: "admin" },
      "member",
      "admin",
      "U-TARGET",
      "通常変更"
    ),
    ""
  );
  assert.equal(calls.length, 0);
});
