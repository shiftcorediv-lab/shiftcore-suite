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
