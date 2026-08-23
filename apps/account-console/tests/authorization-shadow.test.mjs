import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const assignmentHeaders = [
  "permission_assignment_id",
  "internal_user_id",
  "module_code",
  "capability_code",
  "scope_type",
  "scope_value",
  "status",
  "valid_from",
  "valid_to",
  "updated_at",
  "updated_by",
  "memo"
];

const shadowHeaders = [
  "shadow_log_id",
  "checked_date",
  "checked_at",
  "internal_user_id",
  "module_code",
  "legacy_capabilities",
  "assigned_capabilities",
  "legacy_only_capabilities",
  "assigned_only_capabilities",
  "legacy_scopes",
  "assigned_scopes",
  "legacy_only_scopes",
  "assigned_only_scopes"
];

function createSheet(values) {
  return {
    values,
    readCount: 0,
    getDataRange() {
      this.readCount += 1;
      return {
        getDisplayValues: () => this.values.map((row) => row.slice())
      };
    },
    appendRow(row) {
      this.values.push(row.slice());
    }
  };
}

function createAuthorizationContext(assignmentRows = [], options = {}) {
  const propertyValues = {
    AUTHORIZATION_ENFORCEMENT_MODE: options.enforcementMode || "shadow",
    AUTHORIZATION_CUTOVER_ENABLED: options.cutoverEnabled ? "true" : "false",
    AUTHORIZATION_CUTOVER_ACTOR_ID: options.cutoverActorId || "U-1",
    AUTHORIZATION_CUTOVER_REASON: options.cutoverReason || "03 effective cutover test",
    AUTHORIZATION_CUTOVER_MIGRATED_USER_IDS: options.migratedUserIds || ""
  };
  const authorizationLogs = [];
  const executionLogs = [];
  const permissionSheet = createSheet([assignmentHeaders, ...assignmentRows]);
  const shadowSheet = createSheet([shadowHeaders]);
  const spreadsheet = {
    getSheetByName(name) {
      if (name === "permission_assignments") return permissionSheet;
      if (name === "authorization_shadow_logs") {
        return options.missingShadowSheet ? null : shadowSheet;
      }
      return null;
    }
  };
  const context = vm.createContext({
    SpreadsheetApp: {
      openById: () => spreadsheet
    },
    Utilities: {
      formatDate: () => "2026-08-07",
      getUuid: () => "UUID-1"
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => {
          if (Object.hasOwn(propertyValues, key)) return propertyValues[key];
          if (key === "ORGANIZATION_SHADOW_ENABLED") {
            return options.organizationShadowEnabled === false ? "false" : "true";
          }
          return options.shadowEnabled === false ? "false" : "true";
        },
        setProperty: (key, value) => {
          if (options.failEffectiveModeWrite &&
              key === "AUTHORIZATION_ENFORCEMENT_MODE" && value === "effective") {
            throw new Error("MODE_WRITE_FAILED");
          }
          if (options.failShadowRollbackWrite &&
              key === "AUTHORIZATION_ENFORCEMENT_MODE" && value === "shadow" &&
              propertyValues.AUTHORIZATION_ENFORCEMENT_MODE === "effective") {
            throw new Error("SHADOW_ROLLBACK_FAILED");
          }
          propertyValues[key] = String(value);
        },
        deleteProperty: (key) => { delete propertyValues[key]; }
      })
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => "developer@example.com" })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => options.lockAvailable !== false,
        releaseLock: () => {}
      })
    },
    resolveCurrentUserByIdToken: () => ({
      ok: true,
      user: {
        internal_user_id: "U-1",
        status: "active",
        role: "member",
        organization_id: "ORG-1",
        base_area: "関西",
        allowed_modules: options.allowedModules || ["ordercase", "shift"],
        ordercase_permission: "edit",
        shiftbuilder_permission: "self"
      }
    }),
    getUsersData: () => {
      if (options.organizationReadFails) throw new Error("READ_FAILED");
      if (options.usersData) return options.usersData;
      return [{
        internal_user_id: "U-1",
        status: "active",
        role: options.userRole || "developer",
        email: "developer@example.com",
        person_type: "internal",
        allowed_modules: options.allowedModules || ["ordercase", "shift"],
        ordercase_permission: "edit",
        shiftbuilder_permission: "self",
        organization_level: options.organizationLevel || ""
      }];
    },
    getNormalizedPersonType: (user) => String(user && user.person_type || "").trim().toLowerCase(),
    normalizeAccountConsoleEmail_: (email) => String(email || "").trim().toLowerCase(),
    runAuthorizationIntegrityAudit: () => ({ healthy: true }),
    appendAuthorizationChangeLog_: (entry) => {
      authorizationLogs.push({ ...entry });
      if (options.failCutoverSuccessLog && entry.result === "success") {
        const error = new Error("AUDIT_WRITE_FAILED");
        error.code = "AUDIT_WRITE_FAILED";
        throw error;
      }
      return entry;
    },
    parseAllowedModules: (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean),
    getNowIsoStringJst: () => "2026-08-07T10:00:00",
    console: {
      error() {},
      log(value) { executionLogs.push(String(value)); }
    }
  });

  [
    "../backend/account-apps-script/utils.js",
    "../backend/account-apps-script/config.js",
    "../backend/account-apps-script/permission_assignments.js",
    "../backend/account-apps-script/organization_authorization.js",
    "../backend/account-apps-script/authorization.js"
  ].forEach((path) => {
    vm.runInContext(readFileSync(new URL(path, import.meta.url), "utf8"), context);
  });

  return {
    context,
    permissionSheet,
    shadowSheet,
    propertyValues,
    authorizationLogs,
    executionLogs
  };
}

test("新権限が未登録なら旧判定へ戻しShadowログを作らない", () => {
  const { context, shadowSheet } = createAuthorizationContext();
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.source, "legacy");
  assert.equal(result.authorization.legacy_fallback, true);
  assert.equal(result.authorization.shadow.enabled, false);
  assert.deepEqual(
    Array.from(result.authorization.modules.shift.capabilities),
    ["shift.view.all"]
  );
  assert.equal(shadowSheet.values.length, 1);
});

test("新権限がある利用者は新判定を返し旧判定との差だけ記録する", () => {
  const { context, shadowSheet } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ]);
  const first = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });
  const second = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(first.authorization.source, "legacy_shadow");
  assert.equal(first.authorization.legacy_fallback, true);
  assert.deepEqual(
    Array.from(first.authorization.modules.shift.capabilities),
    ["shift.view.all"]
  );
  assert.deepEqual(
    Array.from(first.authorization.candidate_modules.shift.capabilities),
    ["shift.view.self"]
  );
  assert.ok(first.authorization.shadow.differences.length > 0);
  assert.equal(shadowSheet.values.length, 2);
  assert.equal(second.authorization.shadow.enabled, true);
  assert.equal(second.authorization.shadow.healthy, true);
  assert.equal(shadowSheet.readCount, 2);
});

test("scopeだけの差分もShadow差分として記録する", () => {
  const { context, shadowSheet } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.all", "self", "", "active", "", "", "", "", ""]
  ]);
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });
  const shiftDifference = result.authorization.shadow.differences.find(
    (item) => item.module_code === "shift"
  );

  assert.deepEqual(Array.from(shiftDifference.legacy_only_scopes), ["all:"]);
  assert.deepEqual(Array.from(shiftDifference.assigned_only_scopes), ["self:"]);
  assert.equal(shadowSheet.values.length, 2);
});

test("候補行がない別モジュールは全権限喪失として記録しない", () => {
  const { context, shadowSheet } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ]);
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.deepEqual(
    Array.from(result.authorization.shadow.differences, (item) => item.module_code),
    ["shift"]
  );
  assert.equal(shadowSheet.values.length, 2);
});

test("Shadow権限行が不正でも旧権限だけを返す", () => {
  const { context, shadowSheet } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.unknown", "self", "", "active", "", "", "", "", ""]
  ]);
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.source, "legacy");
  assert.equal(result.authorization.shadow.healthy, false);
  assert.deepEqual(Array.from(result.authorization.modules.shift.capabilities), ["shift.view.all"]);
  assert.equal(shadowSheet.values.length, 1);
});

test("Shadowログのロック取得失敗でも旧権限と候補権限を返す", () => {
  const { context, shadowSheet } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { lockAvailable: false });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.shadow.healthy, false);
  assert.deepEqual(Array.from(result.authorization.modules.shift.capabilities), ["shift.view.all"]);
  assert.deepEqual(Array.from(result.authorization.candidate_modules.shift.capabilities), ["shift.view.self"]);
  assert.equal(shadowSheet.values.length, 1);
});

test("Shadowログシートがなくても旧権限を返し欠落を通知する", () => {
  const { context } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { missingShadowSheet: true });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.shadow.healthy, false);
  assert.equal(result.authorization.shadow.logging_available, false);
  assert.deepEqual(Array.from(result.authorization.modules.shift.capabilities), ["shift.view.all"]);
});

test("緊急停止フラグがfalseなら権限行を読まず旧判定だけを返す", () => {
  const { context, shadowSheet } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { shadowEnabled: false });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.authorization.source, "legacy");
  assert.equal(result.authorization.shadow.enabled, false);
  assert.equal(Object.keys(result.authorization.candidate_modules).length, 0);
  assert.equal(shadowSheet.values.length, 1);
});

test("effectiveモードでは割当権限を実効権限として返す", () => {
  const { context } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { enforcementMode: "effective" });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.mode, "effective");
  assert.equal(result.authorization.source, "assigned_effective");
  assert.equal(result.authorization.legacy_fallback, false);
  assert.deepEqual(
    Array.from(result.authorization.modules.shift.capabilities),
    ["shift.view.self"]
  );
  assert.equal(Object.keys(result.authorization.candidate_modules).length, 0);
  assert.equal(result.authorization.shadow.enabled, false);
});

test("effectiveモードで割当がない利用者は旧権限へ戻さない", () => {
  const { context } = createAuthorizationContext([], { enforcementMode: "effective" });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.source, "assigned_effective");
  assert.equal(result.authorization.legacy_fallback, false);
  assert.equal(Object.hasOwn(result.authorization.modules, "shift"), false);
  assert.equal(Object.hasOwn(result.authorization.modules, "ordercase"), false);
});

test("effectiveモードの割当検証失敗は旧権限へ戻さず拒否側に倒す", () => {
  const { context } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.unknown", "self", "", "active", "", "", "", "", ""]
  ], { enforcementMode: "effective" });
  const originalBuildLegacy = context.buildLegacyAuthorizationModules_;
  context.buildLegacyAuthorizationModules_ = (user) => {
    const modules = originalBuildLegacy(user);
    modules.pmo = { capabilities: ["pmo.view"], scopes: [{ type: "all", value: "" }] };
    return modules;
  };
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.source, "assigned_unavailable");
  assert.equal(result.authorization.legacy_fallback, false);
  assert.equal(result.authorization.shadow.healthy, false);
  assert.equal(Object.hasOwn(result.authorization.modules, "shift"), false);
  assert.equal(Object.hasOwn(result.authorization.modules, "pmo"), true);
});

test("effectiveモードはShadowログ基盤へ依存しない", () => {
  const { context } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { enforcementMode: "effective", missingShadowSheet: true });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.source, "assigned_effective");
  assert.equal(result.authorization.shadow.healthy, true);
  assert.equal(result.authorization.shadow.logging_available, false);
  assert.deepEqual(
    Array.from(result.authorization.modules.shift.capabilities),
    ["shift.view.self"]
  );
});

test("不正な実効権限モードは構造化エラーで拒否する", () => {
  const { context } = createAuthorizationContext([], { enforcementMode: "typo" });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, false);
  assert.equal(result.code, "AUTHORIZATION_MODE_INVALID");
});

test("切替プレビューは旧権限利用者の割当不足を検出する", () => {
  const { context } = createAuthorizationContext();
  const result = context.previewAuthorizationEffectiveCutover();

  assert.equal(result.ok, false);
  assert.equal(result.users_with_legacy_access, 1);
  assert.equal(result.unconfigured_users, 1);
});

test("切替プレビューは旧管理権限0件でも移行未確認の割当利用者を拒否する", () => {
  const { context } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { allowedModules: ["pmo"], userRole: "member" });
  const result = context.previewAuthorizationEffectiveCutover();

  assert.equal(result.ok, false);
  assert.equal(result.users_with_legacy_access, 0);
  assert.equal(result.unconfigured_users, 1);
});

test("切替プレビュー実行関数は内部IDを含めず件数結果だけをログ出力する", () => {
  const { context, executionLogs } = createAuthorizationContext([], {
    migratedUserIds: "U-1"
  });
  const result = context.runAuthorizationEffectiveCutoverPreview();

  assert.equal(result.ok, true);
  assert.equal(executionLogs.length, 1);
  assert.match(executionLogs[0], /^AUTHORIZATION_CUTOVER_PREVIEW /);
  assert.equal(executionLogs[0].includes("U-1"), false);
  const logged = JSON.parse(executionLogs[0].replace(/^AUTHORIZATION_CUTOVER_PREVIEW /, ""));
  assert.equal(logged.active_internal_users, 1);
  assert.equal(logged.configured_users, 1);
  assert.equal(Object.hasOwn(logged, "internal_user_ids"), false);
});

test("承認済み切替は監査開始成功を記録してeffectiveへ移る", () => {
  const { context, propertyValues, authorizationLogs } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { cutoverEnabled: true, migratedUserIds: "U-1" });
  const result = context.runAuthorizationEffectiveCutover();

  assert.equal(result.ok, true);
  assert.equal(propertyValues.AUTHORIZATION_ENFORCEMENT_MODE, "effective");
  assert.equal(propertyValues.AUTHORIZATION_CUTOVER_ENABLED, "false");
  assert.deepEqual(authorizationLogs.map((item) => item.result), ["started", "success"]);
});

test("切替成功ログに失敗した場合はshadowへ自動復帰する", () => {
  const { context, propertyValues, authorizationLogs } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { cutoverEnabled: true, migratedUserIds: "U-1", failCutoverSuccessLog: true });

  assert.throws(
    () => context.runAuthorizationEffectiveCutover(),
    /AUDIT_WRITE_FAILED/
  );
  assert.equal(propertyValues.AUTHORIZATION_ENFORCEMENT_MODE, "shadow");
  assert.equal(propertyValues.AUTHORIZATION_CUTOVER_ENABLED, "false");
  assert.deepEqual(authorizationLogs.map((item) => item.result), ["started", "success", "error"]);
  assert.equal(authorizationLogs[2].before.mode, "effective");
  assert.equal(authorizationLogs[2].after.mode, "shadow");
  assert.throws(
    () => context.runAuthorizationEffectiveCutover(),
    /AUTHORIZATION_CUTOVER_NOT_APPROVED/
  );
});

test("effectiveモード書込み失敗でも決裁を消費してerrorを記録する", () => {
  const { context, propertyValues, authorizationLogs } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    cutoverEnabled: true,
    migratedUserIds: "U-1",
    failEffectiveModeWrite: true
  });

  assert.throws(() => context.runAuthorizationEffectiveCutover(), /MODE_WRITE_FAILED/);
  assert.equal(propertyValues.AUTHORIZATION_ENFORCEMENT_MODE, "shadow");
  assert.equal(propertyValues.AUTHORIZATION_CUTOVER_ENABLED, "false");
  assert.deepEqual(authorizationLogs.map((item) => item.result), ["started", "error"]);
  assert.equal(authorizationLogs[1].before.mode, "shadow");
  assert.equal(authorizationLogs[1].after.mode, "shadow");
});

test("Shadow自動復帰失敗はrecovery_requiredを記録して構造化エラーにする", () => {
  const { context, propertyValues, authorizationLogs } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    cutoverEnabled: true,
    migratedUserIds: "U-1",
    failCutoverSuccessLog: true,
    failShadowRollbackWrite: true
  });

  let caught;
  try {
    context.runAuthorizationEffectiveCutover();
  } catch (error) {
    caught = error;
  }
  assert.equal(caught.code, "AUTHORIZATION_CUTOVER_RECOVERY_REQUIRED");
  assert.equal(caught.original_error_code, "AUDIT_WRITE_FAILED");
  assert.equal(caught.rollback_error_code, "SHADOW_ROLLBACK_FAILED");
  assert.equal(propertyValues.AUTHORIZATION_ENFORCEMENT_MODE, "effective");
  assert.equal(propertyValues.AUTHORIZATION_CUTOVER_ENABLED, "false");
  assert.deepEqual(
    authorizationLogs.map((item) => item.result),
    ["started", "success", "recovery_required"]
  );
  assert.equal(authorizationLogs[2].before.mode, "effective");
  assert.equal(authorizationLogs[2].after.mode, "effective");
  assert.equal(authorizationLogs[2].after.original_error_code, "AUDIT_WRITE_FAILED");
  assert.equal(authorizationLogs[2].after.rollback_error_code, "SHADOW_ROLLBACK_FAILED");
});

test("ロールバックは実効モードをshadowへ戻して監査記録する", () => {
  const { context, propertyValues, authorizationLogs } = createAuthorizationContext([], {
    enforcementMode: "effective"
  });
  const result = context.runAuthorizationEffectiveRollback();

  assert.equal(result.ok, true);
  assert.equal(propertyValues.AUTHORIZATION_ENFORCEMENT_MODE, "shadow");
  assert.equal(authorizationLogs.length, 1);
  assert.equal(authorizationLogs[0].event_type, "authorization.effective.rollback");
  assert.equal(authorizationLogs[0].result, "success");
});

test("共通権限応答へ直属管理者IDと役員承認者IDを公開しない", () => {
  const { context } = createAuthorizationContext([], { organizationLevel: "leader" });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });
  const organization = result.authorization.organization_shadow;

  assert.equal(Object.hasOwn(organization, "direct_manager_user_id"), false);
  assert.equal(Object.hasOwn(organization, "executive_reviewer_user_id"), false);
});

test("組織情報の読取失敗を旧権限から隔離する", () => {
  const { context } = createAuthorizationContext([], { organizationReadFails: true });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.authorization.modules.shift.capabilities), ["shift.view.all"]);
  assert.equal(result.authorization.organization_shadow.configured, false);
});

test("組織Shadowだけを緊急停止しても旧権限を返す", () => {
  const { context } = createAuthorizationContext([], {
    organizationLevel: "leader",
    organizationShadowEnabled: false
  });
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.organization_shadow.enabled, false);
  assert.deepEqual(Array.from(result.authorization.modules.shift.capabilities), ["shift.view.all"]);
});

test("期限外・停止中の権限行は有効権限として扱わない", () => {
  const { context } = createAuthorizationContext([
    ["PA-1", "U-1", "ordercase", "ordercase.view", "all", "", "inactive", "", "", "", "", ""],
    ["PA-2", "U-1", "ordercase", "ordercase.amount.view", "all", "", "active", "2026-08-08", "", "", "", ""],
    ["PA-3", "U-1", "shift", "shift.view.self", "self", "", "active", "", "2026-08-06", "", "", ""]
  ]);
  const assignments = context.getActivePermissionAssignmentsForUser_(
    "U-1",
    new Date("2026-08-07T00:00:00Z")
  );

  assert.equal(assignments.length, 0);
});

test("権限コードと対象アプリの不一致を拒否する", () => {
  const { context } = createAuthorizationContext();

  assert.throws(
    () => context.validatePermissionAssignment_({
      module_code: "ordercase",
      capability_code: "shift.view.all",
      scope_type: "all",
      scope_value: ""
    }),
    /module_codeとcapability_codeが一致しません/
  );

  assert.throws(
    () => context.validatePermissionAssignment_({
      module_code: "shift",
      capability_code: "shift.view.self",
      scope_type: "self",
      scope_value: "",
      valid_from: "2026/08/07"
    }),
    /valid_fromはYYYY-MM-DD形式/
  );

  assert.throws(
    () => context.validatePermissionAssignment_({
      module_code: "shift",
      capability_code: "shift.view.self",
      scope_type: "self",
      scope_value: "U-OTHER"
    }),
    /scope_valueは空欄/
  );
});

test("Shadowログへ書く文字列が数式記号から始まる場合は無害化する", () => {
  const { context, shadowSheet } = createAuthorizationContext([
    ["PA-1", "U-1", "shift", "shift.view.all", "organization", "=IMPORTDATA(\"https://example.invalid\")", "active", "", "", "", "", ""]
  ]);
  const result = context.resolveAuthorizationContextByIdToken_({ idToken: "TOKEN" });
  const logRow = shadowSheet.values[1];

  assert.equal(result.authorization.shadow.healthy, true);
  assert.equal(logRow[3], "U-1");
  assert.equal(logRow[10], "organization:=IMPORTDATA(\"https://example.invalid\")");
  assert.equal(logRow[12], "organization:=IMPORTDATA(\"https://example.invalid\")");
  assert.equal(context.escapeAuthorizationSheetText_("=1+1"), "'=1+1");
  assert.equal(context.escapeAuthorizationSheetText_("@SUM(A1)"), "'@SUM(A1)");
});

test("旧権限移行プレビューは不足を集計し利用者IDをログへ出さない", () => {
  const usersData = [
    {
      internal_user_id: "U-SECRET-1",
      status: "active",
      role: "member",
      person_type: "internal",
      display_name: "秘密太郎",
      email: "secret-one@example.com",
      allowed_modules: ["account_console", "ordercase"],
      ordercase_permission: "view"
    },
    {
      internal_user_id: "U-SECRET-2",
      status: "active",
      role: "member",
      person_type: "internal",
      allowed_modules: []
    },
    {
      internal_user_id: "U-EXTERNAL",
      status: "active",
      role: "member",
      person_type: "external",
      allowed_modules: ["account_console"]
    }
  ];
  const { context, executionLogs } = createAuthorizationContext([], { usersData });
  const result = context.runAuthorizationLegacyAssignmentMigrationPreview();

  assert.equal(result.ok, false);
  assert.equal(result.active_internal_users, 2);
  assert.equal(result.users_with_legacy_access, 1);
  assert.equal(result.users_requiring_additions, 1);
  assert.equal(result.missing_capabilities, 8);
  assert.equal(result.missing_scopes, 2);
  assert.equal(executionLogs.length, 1);
  assert.match(executionLogs[0], /^AUTHORIZATION_LEGACY_MIGRATION_PREVIEW /);
  const publicOutput = JSON.stringify({ result, executionLogs });
  assert.doesNotMatch(publicOutput, /U-SECRET|秘密太郎|secret-one@example\.com/);
  assert.doesNotMatch(publicOutput, /"users"|"internal_user_id"|"email"|"display_name"/);
});

test("旧権限移行分析は余剰権限・ゼロ権限・非ゼロ完全一致を区別する", () => {
  const usersData = [
    {
      internal_user_id: "U-1",
      status: "active",
      role: "member",
      person_type: "internal",
      allowed_modules: ["ordercase"],
      ordercase_permission: "view_without_amount"
    },
    {
      internal_user_id: "U-2",
      status: "active",
      role: "member",
      person_type: "internal",
      allowed_modules: []
    },
    {
      internal_user_id: "U-3",
      status: "active",
      role: "member",
      person_type: "internal",
      allowed_modules: ["ordercase"],
      ordercase_permission: "view_without_amount"
    }
  ];
  const rows = [
    ["PA-1", "U-1", "ordercase", "ordercase.view", "all", "", "active", "", "", "", "", ""],
    ["PA-2", "U-1", "ordercase", "ordercase.amount.view", "all", "", "active", "", "", "", "", ""],
    ["PA-3", "U-3", "ordercase", "ordercase.view", "all", "", "active", "", "", "", "", ""]
  ];
  const { context } = createAuthorizationContext(rows, { usersData });
  const analysis = context.analyzeAuthorizationLegacyAssignmentMigration_();

  assert.equal(analysis.summary.active_internal_users, 3);
  assert.equal(analysis.summary.equivalent_users, 2);
  assert.equal(analysis.summary.users_with_no_legacy_or_assignments, 1);
  assert.equal(analysis.summary.equivalent_nonzero_users, 1);
  assert.equal(analysis.summary.users_requiring_additions, 0);
  assert.equal(analysis.summary.users_requiring_removals, 1);
  assert.equal(analysis.summary.extra_capabilities, 1);
  assert.equal(analysis.users[1].classification, "no_legacy_or_assignments");
  assert.equal(analysis.users[2].classification, "equivalent_nonzero");
});

test("旧権限移行プレビューは内部ID欠損と対象外利用者のactive割当を拒否する", () => {
  const usersData = [{
    internal_user_id: "U-1",
    status: "active",
    role: "member",
    person_type: "internal",
    allowed_modules: []
  }];
  const rows = [
    ["PA-1", "", "ordercase", "ordercase.view", "all", "", "active", "", "", "", "", ""],
    ["PA-2", "U-UNKNOWN", "ordercase", "ordercase.view", "all", "", "active", "", "", "", "", ""]
  ];
  const { context } = createAuthorizationContext(rows, { usersData });
  const result = context.runAuthorizationLegacyAssignmentMigrationPreview();

  assert.equal(result.ok, false);
  assert.equal(result.invalid_users, 0);
  assert.equal(result.invalid_assignments, 2);
});
