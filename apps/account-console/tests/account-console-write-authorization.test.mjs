import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const usersSource = readFileSync(
  new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
  "utf8"
);
const apiSource = readFileSync(
  new URL("../backend/account-apps-script/api.js", import.meta.url),
  "utf8"
);
const signupSource = readFileSync(
  new URL("../backend/account-apps-script/signup_admin.js", import.meta.url),
  "utf8"
);
const logsSource = readFileSync(
  new URL("../backend/account-apps-script/account_console_logs.js", import.meta.url),
  "utf8"
);
const frontendSource = readFileSync(new URL("../js/account-console/main.js", import.meta.url), "utf8");
const signupFrontendSource = readFileSync(new URL("../js/signup-admin/main.js", import.meta.url), "utf8");
const authorizationSource = readFileSync(
  new URL("../backend/account-apps-script/authorization.js", import.meta.url),
  "utf8"
);

function createUsersContext() {
  const context = vm.createContext({});
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  vm.runInContext(usersSource, context);
  return context;
}

test("Account Consoleは閲覧権限と利用者編集権限をサーバー側で分離する", () => {
  const context = createUsersContext();
  assert.equal(context.isAccountConsoleEditor_({ role: "member", allowed_modules: ["account_console"] }), false);
  assert.equal(context.isAccountConsoleEditor_({ role: "admin" }), true);
  assert.equal(context.isAccountConsoleEditor_({ role: "developer" }), true);
  context.requireAccountConsoleOperator_ = () => ({
    internal_user_id: "U-VIEWER",
    role: "member",
    allowed_modules: ["account_console"]
  });
  assert.throws(
    () => context.requireAccountConsoleEditor_({ idToken: "valid" }),
    /ACCOUNT_CONSOLE_WRITE_FORBIDDEN/
  );

  const createFunction = usersSource.slice(
    usersSource.indexOf("function accountConsoleCreateUser(body)"),
    usersSource.indexOf("// ===== ユーザー新規作成ここまで =====")
  );
  const updateFunction = usersSource.slice(
    usersSource.indexOf("function accountConsoleUpdateUser(body)"),
    usersSource.indexOf("// ===== ユーザー更新ここまで =====")
  );
  assert.match(createFunction, /requireAccountConsoleEditor_\(body\)/);
  assert.match(updateFunction, /requireAccountConsoleEditor_\(body\)/);
  assert.match(frontendSource, /canEditUsers/);
  assert.doesNotMatch(frontendSource, /人員マスターは、管理者・役員・開発者のみ許可できます/);

  const authorizationContext = vm.createContext({
    normalizeText: (value) => String(value == null ? "" : value).trim(),
    parseAllowedModules: (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean),
    AUTHORIZATION_SHADOW_MODULE_CODES: ["account_console", "ordercase", "shift"]
  });
  vm.runInContext(authorizationSource, authorizationContext);
  assert.deepEqual(
    Array.from(authorizationContext.buildLegacyAuthorizationModules_({
      role: "member",
      allowed_modules: ["account_console"]
    }).account_console.capabilities),
    ["account.view"]
  );
  assert.deepEqual(
    Array.from(authorizationContext.buildLegacyAuthorizationModules_({
      role: "admin",
      allowed_modules: ["account_console"]
    }).account_console.capabilities),
    [
      "account.permission.edit",
      "account.profile.edit",
      "account.signup.review",
      "account.status.edit",
      "account.view",
      "audit.view"
    ]
  );
});

test("変更履歴はaudit.view相当のadminとdeveloperだけが取得できる", () => {
  const context = vm.createContext({
    normalizeText: (value) => String(value == null ? "" : value).trim()
  });
  vm.runInContext(logsSource, context);

  assert.equal(context.isAccountConsoleAuditViewer_({ role: "member" }), false);
  assert.equal(context.isAccountConsoleAuditViewer_({ role: "admin" }), true);
  assert.equal(context.isAccountConsoleAuditViewer_({ role: "developer" }), true);

  context.requireAccountConsoleOperator_ = () => ({ role: "member" });
  assert.throws(
    () => context.requireAccountConsoleAuditViewer_({ idToken: "valid" }),
    /ACCOUNT_CONSOLE_AUDIT_VIEW_FORBIDDEN/
  );

  assert.match(usersSource, /canViewAuditLogs/);
  assert.match(usersSource, /canViewAuditLogs\s*\?\s*listAccountConsoleLogs_/);
  assert.match(frontendSource, /canViewAuditLogs/);
});

test("一覧と初期表示はスキーマ変更や補完処理を実行しない", () => {
  const bootstrap = usersSource.slice(
    usersSource.indexOf("function accountConsoleGetBootstrap(body)"),
    usersSource.indexOf("// ===== 初期表示データ取得ここまで =====")
  );
  const list = usersSource.slice(
    usersSource.indexOf("function accountConsoleListUsers(body)"),
    usersSource.indexOf("// ===== ユーザー一覧取得ここまで =====")
  );
  assert.doesNotMatch(bootstrap, /ensureAccountConsoleNameColumns_/);
  assert.doesNotMatch(list, /ensureAccountConsoleNameColumns_/);
});

test("adminとdeveloperでも自分自身の権限・状態・稼働権限を変更できない", () => {
  const context = createUsersContext();
  const operator = { internal_user_id: "U-SELF", role: "admin" };
  const before = {
    role: "admin",
    status: "active",
    workStatus: "on",
    engagement_status: "active",
    allowed_modules: "account_console,ordercase,shift",
    ordercase_permission: "all",
    shiftbuilder_permission: "all",
    memo: "before"
  };

  for (const [field, value] of [
    ["role", "member"],
    ["status", "inactive"],
    ["workStatus", "off"],
    ["engagement_status", "inactive"],
    ["allowed_modules", "account_console"],
    ["ordercase_permission", "view"],
    ["shiftbuilder_permission", "view"]
  ]) {
    assert.throws(
      () => context.assertAccountConsoleSelfSensitiveFieldsUnchanged_(
        operator,
        before,
        { ...before, [field]: value },
        "U-SELF"
      ),
      /SELF_ACCOUNT_PERMISSION_CHANGE_FORBIDDEN/
    );
  }

  assert.equal(
    context.assertAccountConsoleSelfSensitiveFieldsUnchanged_(
      operator,
      before,
      { ...before, memo: "after" },
      "U-SELF"
    ),
    true
  );
  assert.equal(
    context.assertAccountConsoleSelfSensitiveFieldsUnchanged_(
      operator,
      before,
      { ...before, role: "member" },
      "U-OTHER"
    ),
    true
  );
});

test("登録申請は一覧参照を分離し承認・却下をadmin/developerだけへ限定する", () => {
  const context = vm.createContext({
    normalizeText: (value) => String(value == null ? "" : value).trim()
  });
  vm.runInContext(signupSource, context);
  assert.equal(context.isSignupRequestEditor_({ role: "member" }), false);
  assert.equal(context.isSignupRequestEditor_({ role: "admin" }), true);
  assert.equal(context.isSignupRequestEditor_({ role: "developer" }), true);
  context.requireSignupRequestViewer_ = () => ({
    success: true,
    user: { internal_user_id: "U-VIEWER", role: "member", allowed_modules: ["account_console"] },
    operatorId: "U-VIEWER"
  });
  assert.equal(context.requireSignupAdminOperator_({ idToken: "valid" }).code, "SIGNUP_REVIEW_WRITE_FORBIDDEN");

  const listBranch = apiSource.slice(
    apiSource.indexOf('if (action === "getSignupRequestsSecure")'),
    apiSource.indexOf('if (action === "approveSignupRequest")')
  );
  assert.match(listBranch, /requireSignupRequestViewer_/);
  assert.match(apiSource, /requireSignupAdminOperator_\(body\)/);
  assert.match(signupFrontendSource, /canEditRequests/);
});
