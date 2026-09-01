import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

const authorizationLogHeaders = [
  "authorization_change_log_id", "authorization_event_id", "occurred_at",
  "event_type", "request_id", "actor_internal_user_id",
  "target_internal_user_id", "reviewer_internal_user_id", "before_json",
  "after_json", "reason", "result", "error_code", "source",
  "previous_log_hash", "log_hash"
];

function createSheet(values, options = {}) {
  let appendCount = 0;
  return {
    values,
    readCount: 0,
    getDataRange() {
      this.readCount += 1;
      return {
        getDisplayValues: () => this.values.map((row) => row.slice()),
        getValues: () => this.values.map((row) => row.slice())
      };
    },
    appendRow(row) {
      appendCount += 1;
      if (options.failAppendAt === appendCount) throw new Error("APPEND_FAILED");
      this.values.push(row.slice());
      if (options.injectForeignAfterAppendAt === appendCount) {
        this.values.push(options.foreignRow.slice());
      }
    },
    getLastRow() {
      return this.values.length;
    },
    getLastColumn() {
      return this.values[0]?.length || 0;
    },
    getRange(row, column, rowCount, columnCount) {
      const sheet = this;
      return {
        getDisplayValues: () => sheet.values
          .slice(row - 1, row - 1 + rowCount)
          .map((source) => source.slice(column - 1, column - 1 + columnCount)),
        getValues: () => sheet.values
          .slice(row - 1, row - 1 + rowCount)
          .map((source) => {
            const copy = source.slice(column - 1, column - 1 + columnCount);
            if (options.mutateArchiveTargetOnRead && copy[0] === "PA-EXTRA") {
              copy[3] = "shift.view.all";
            }
            return copy;
          }),
        getDisplayValue: () => String(sheet.values[row - 1]?.[column - 1] || ""),
        setValues(nextValues) {
          if (options.failArchiveWrite && nextValues[0]?.[6] === "archived") {
            throw new Error("ARCHIVE_WRITE_FAILED");
          }
          if (options.failRestore && nextValues[0]?.[6] === "active" &&
              sheet.values[row - 1]?.[6] === "archived") {
            throw new Error("RESTORE_FAILED");
          }
          nextValues.forEach((source, rowOffset) => {
            source.forEach((value, columnOffset) => {
              sheet.values[row - 1 + rowOffset][column - 1 + columnOffset] = value;
            });
          });
          if (options.injectArchiveConcurrentChange && nextValues[0]?.[6] === "archived") {
            sheet.values[row - 1][8] = "2099-12-31";
          }
        }
      };
    },
    deleteRow(row) {
      if (options.failDeleteRows) throw new Error("DELETE_FAILED");
      this.values.splice(row - 1, 1);
    }
  };
}

function createAuthorizationContext(assignmentRows = [], options = {}) {
  const propertyValues = {
    AUTHORIZATION_ENFORCEMENT_MODE: options.enforcementMode || "shadow",
    AUTHORIZATION_CUTOVER_ENABLED: options.cutoverEnabled ? "true" : "false",
    AUTHORIZATION_CUTOVER_ACTOR_ID: options.cutoverActorId || "U-1",
    AUTHORIZATION_CUTOVER_REASON: options.cutoverReason || "03 effective cutover test",
    AUTHORIZATION_CUTOVER_MIGRATED_USER_IDS: options.migratedUserIds || "",
    AUTHORIZATION_MIGRATION_ENABLED: options.migrationEnabled ? "true" : "false",
    AUTHORIZATION_MIGRATION_ACTOR_ID: options.migrationActorId || "U-1",
    AUTHORIZATION_MIGRATION_REASON: options.migrationReason || "03 assignment migration test",
    AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH: options.approvedPlanHash || ""
  };
  const authorizationLogs = [];
  const executionLogs = [];
  let integrityAuditCount = 0;
  const permissionSheet = createSheet([assignmentHeaders, ...assignmentRows], {
    failAppendAt: options.failMigrationAppendAt,
    failDeleteRows: options.failMigrationDeleteRows,
    failRestore: options.failMigrationRestore,
    mutateArchiveTargetOnRead: options.mutateArchiveTargetOnRead,
    injectForeignAfterAppendAt: options.injectForeignAfterAppendAt,
    foreignRow: options.foreignRow,
    injectArchiveConcurrentChange: options.injectArchiveConcurrentChange,
    failArchiveWrite: options.failMigrationArchiveWrite
  });
  let usersReadCount = 0;
  const shadowSheet = createSheet([shadowHeaders]);
  const authorizationLogSheet = createSheet([authorizationLogHeaders]);
  const spreadsheet = {
    getSheetByName(name) {
      if (name === "permission_assignments") return permissionSheet;
      if (name === "authorization_shadow_logs") {
        return options.missingShadowSheet ? null : shadowSheet;
      }
      if (name === "authorization_change_logs") return authorizationLogSheet;
      return null;
    }
  };
  let uuidCount = 0;
  let anchorWriteCount = 0;
  const context = vm.createContext({
    SpreadsheetApp: {
      openById: () => spreadsheet
    },
    Utilities: {
      formatDate: () => "2026-08-07",
      getUuid: () => `UUID-${++uuidCount}`,
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (_algorithm, value) => Array.from(
        createHash("sha256").update(String(value), "utf8").digest()
      ),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString("base64url")
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => {
          if (Object.hasOwn(propertyValues, key)) return propertyValues[key];
          if (key === "AUTHORIZATION_LOG_ANCHOR") return "";
          if (key === "ORGANIZATION_SHADOW_ENABLED") {
            return options.organizationShadowEnabled === false ? "false" : "true";
          }
          return options.shadowEnabled === false ? "false" : "true";
        },
        getProperties: () => ({ ...propertyValues }),
        setProperty: (key, value) => {
          if (key === "AUTHORIZATION_LOG_ANCHOR") {
            anchorWriteCount += 1;
            if (options.failAuditAnchorAt === anchorWriteCount) {
              const error = new Error("AUDIT_ANCHOR_WRITE_FAILED");
              error.code = "AUDIT_ANCHOR_WRITE_FAILED";
              throw error;
            }
          }
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
        shiftbuilder_permission: options.shiftbuilderPermission || "self"
      }
    }),
    getUsersData: () => {
      usersReadCount += 1;
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
        shiftbuilder_permission: options.shiftbuilderPermission || "self",
        organization_level: options.organizationLevel || ""
      }];
    },
    getNormalizedPersonType: (user) => String(user && user.person_type || "").trim().toLowerCase(),
    validateOrganizationGraph_: () => ({ healthy: true, errors: [] }),
    normalizeAccountConsoleEmail_: (email) => String(email || "").trim().toLowerCase(),
    runAuthorizationIntegrityAudit: () => {
      integrityAuditCount += 1;
      if (options.failMigrationPostIntegrity && integrityAuditCount === 2) {
        throw new Error("INTEGRITY_FAILED");
      }
      return { healthy: true };
    },
    appendAuthorizationChangeLog_: (entry) => {
      authorizationLogs.push({ ...entry });
      if (options.failCutoverSuccessLog && entry.result === "success") {
        const error = new Error("AUDIT_WRITE_FAILED");
        error.code = "AUDIT_WRITE_FAILED";
        throw error;
      }
      if (options.failMigrationSuccessLog &&
          entry.event_type === "authorization.assignment.migration" &&
          entry.result === "success") {
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
  if (options.useRealAuthorizationLog) {
    vm.runInContext(readFileSync(new URL(
      "../backend/account-apps-script/authorization_change_logs.js",
      import.meta.url
    ), "utf8"), context);
  }

  return {
    context,
    permissionSheet,
    shadowSheet,
    propertyValues,
    authorizationLogs,
    authorizationLogSheet,
    executionLogs,
    get usersReadCount() { return usersReadCount; }
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

test("移行計画は旧権限同等の追加と余剰割当のアーカイブを集計する", () => {
  const { context } = createAuthorizationContext([
    ["PA-KEEP", "U-1", "shift", "shift.view.all", "all", "", "active", "", "", "", "", ""],
    ["PA-EXTRA", "U-1", "shift", "shift.override", "all", "", "active", "", "", "", "", ""]
  ], { allowedModules: ["shift"], userRole: "member", shiftbuilderPermission: "edit" });
  const result = context.buildAuthorizationLegacyAssignmentMigrationPlan_();

  assert.equal(result.summary.additions, 2);
  assert.equal(result.summary.archives, 1);
  assert.equal(result.summary.unchanged_assignments, 1);
  assert.equal(result.summary.by_module.shift.additions, 2);
  assert.equal(result.summary.by_module.shift.archives, 1);
  assert.equal(result.additions.every((item) => item.scope_type === "all"), true);
  assert.deepEqual(Array.from(result.archives, (item) => item.permission_assignment_id), ["PA-EXTRA"]);
});

test("移行計画ログは内部IDと割当IDを公開しない", () => {
  const { context, executionLogs } = createAuthorizationContext([], {
    allowedModules: ["shift"],
    userRole: "member",
    shiftbuilderPermission: "edit"
  });
  const summary = context.runAuthorizationLegacyAssignmentMigrationPlanPreview();

  assert.equal(summary.additions, 3);
  assert.equal(executionLogs.length, 1);
  assert.match(executionLogs[0], /^AUTHORIZATION_LEGACY_MIGRATION_PLAN /);
  assert.equal(executionLogs[0].includes("U-1"), false);
  assert.equal(executionLogs[0].includes("permission_assignment_id"), false);
  assert.equal(executionLogs[0].includes("developer@example.com"), false);
  assert.equal(Object.hasOwn(summary, "additions"), true);
  assert.equal(Array.isArray(summary.additions), false);
  assert.equal(Object.hasOwn(summary, "archives"), true);
  assert.equal(Array.isArray(summary.archives), false);
  assert.equal(typeof summary.plan_hash, "string");
  assert.ok(summary.plan_hash.length > 20);
});

test("移行計画は同一スナップショットを検証・計画・ハッシュへ使用する", () => {
  const state = createAuthorizationContext([], {
    allowedModules: ["shift"],
    userRole: "member",
    shiftbuilderPermission: "edit"
  });
  state.context.buildAuthorizationLegacyAssignmentMigrationPlan_();

  assert.equal(state.usersReadCount, 1);
  assert.equal(state.permissionSheet.readCount, 1);
});

test("移行計画は同一組合せを1行維持し別IDの重複行だけをアーカイブする", () => {
  const { context } = createAuthorizationContext([
    ["PA-KEEP", "U-1", "shift", "shift.view.all", "all", "", "active", "", "", "", "", ""],
    ["PA-DUP", "U-1", "shift", "shift.view.all", "all", "", "active", "", "", "", "", ""]
  ], { allowedModules: ["shift"], userRole: "member" });
  const result = context.buildAuthorizationLegacyAssignmentMigrationPlan_();

  assert.equal(result.summary.unchanged_assignments, 1);
  assert.equal(result.summary.archives, 1);
  assert.equal(result.archives[0].permission_assignment_id, "PA-DUP");
});

test("移行計画は停止中・期限外・対象外moduleをアーカイブ候補にしない", () => {
  const { context } = createAuthorizationContext([
    ["PA-INACTIVE", "U-1", "shift", "shift.override", "all", "", "inactive", "", "", "", "", ""],
    ["PA-EXPIRED", "U-1", "shift", "shift.override", "all", "", "active", "2026-01-01", "2026-01-02", "", "", ""],
    ["PA-ATTENDANCE", "U-1", "attendance", "attendance.team.view", "self", "", "active", "", "", "", "", ""]
  ], { allowedModules: ["shift"], userRole: "member" });
  const result = context.buildAuthorizationLegacyAssignmentMigrationPlan_();

  assert.equal(result.summary.archives, 0);
});

test("移行計画は現在有効な管理対象割当のID欠損と重複を拒否する", () => {
  const missing = createAuthorizationContext([
    ["", "U-1", "shift", "shift.override", "all", "", "active", "", "", "", "", ""]
  ], { allowedModules: ["shift"], userRole: "member" });
  assert.throws(
    () => missing.context.buildAuthorizationLegacyAssignmentMigrationPlan_(),
    /AUTHORIZATION_MIGRATION_SOURCE_INVALID/
  );

  const duplicate = createAuthorizationContext([
    ["PA-DUP", "U-1", "shift", "shift.view.all", "all", "", "active", "", "", "", "", ""],
    ["PA-DUP", "U-1", "shift", "shift.override", "all", "", "active", "", "", "", "", ""]
  ], { allowedModules: ["shift"], userRole: "member" });
  assert.throws(
    () => duplicate.context.buildAuthorizationLegacyAssignmentMigrationPlan_(),
    /AUTHORIZATION_MIGRATION_SOURCE_INVALID/
  );
});

test("移行計画ハッシュは同一入力で安定しアーカイブ割当ID変更を検出する", () => {
  const rows = [[
    "PA-EXTRA", "U-1", "shift", "shift.override", "all", "", "active", "", "", "", "", ""
  ]];
  const first = createAuthorizationContext(rows, {
    allowedModules: ["shift"], userRole: "member"
  }).context.buildAuthorizationLegacyAssignmentMigrationPlan_().summary.plan_hash;
  const second = createAuthorizationContext(rows, {
    allowedModules: ["shift"], userRole: "member"
  }).context.buildAuthorizationLegacyAssignmentMigrationPlan_().summary.plan_hash;
  const changed = createAuthorizationContext([
    ["PA-CHANGED", "U-1", "shift", "shift.override", "all", "", "active", "", "", "", "", ""]
  ], { allowedModules: ["shift"], userRole: "member" })
    .context.buildAuthorizationLegacyAssignmentMigrationPlan_().summary.plan_hash;

  assert.equal(first, second);
  assert.notEqual(first, changed);
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
  assert.equal(result.missing_capabilities, 3);
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

test("旧権限移行分析は重複したactive内部IDを通常差分へ二重計上しない", () => {
  const duplicateUser = {
    internal_user_id: "U-DUPLICATE",
    status: "active",
    role: "member",
    person_type: "internal",
    allowed_modules: ["account_console"]
  };
  const { context } = createAuthorizationContext([], {
    usersData: [duplicateUser, { ...duplicateUser }]
  });
  const analysis = context.analyzeAuthorizationLegacyAssignmentMigration_();

  assert.equal(analysis.summary.ok, false);
  assert.equal(analysis.summary.active_internal_users, 2);
  assert.equal(analysis.summary.invalid_users, 2);
  assert.equal(analysis.summary.missing_capabilities, 0);
  assert.equal(analysis.summary.missing_scopes, 0);
  assert.equal(analysis.users.length, 2);
  assert.ok(analysis.users.every((user) => user.invalid === true));
  assert.ok(analysis.users.every((user) => user.classification === "invalid_user"));
});

test("一括移行は承認済み計画ハッシュをLock内で照合しShadowのまま反映する", () => {
  const usersData = [{
    internal_user_id: "U-1",
    status: "active",
    role: "developer",
    email: "developer@example.com",
    person_type: "internal",
    allowed_modules: []
  }];
  const rows = [
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ];
  const fixture = createAuthorizationContext(rows, {
    usersData,
    migrationEnabled: true
  });
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  const result = fixture.context.runAuthorizationLegacyAssignmentMigrationApply();
  const verified = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();

  assert.equal(result.ok, true);
  assert.equal(result.plan_hash, preview.summary.plan_hash);
  assert.equal(verified.summary.ok, true);
  assert.equal(verified.summary.additions, 0);
  assert.equal(verified.summary.archives, 0);
  assert.equal(fixture.propertyValues.AUTHORIZATION_ENFORCEMENT_MODE, "shadow");
  assert.equal(fixture.propertyValues.AUTHORIZATION_MIGRATION_ENABLED, "false");
  assert.equal("AUTHORIZATION_MIGRATION_ACTOR_ID" in fixture.propertyValues, false);
  assert.equal("AUTHORIZATION_MIGRATION_REASON" in fixture.propertyValues, false);
  assert.equal("AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH" in fixture.propertyValues, false);
  assert.deepEqual(
    fixture.authorizationLogs.map((entry) => entry.result),
    ["started", "success"]
  );
  assert.ok(fixture.permissionSheet.values.some((row) => row[0] === "PA-EXTRA" && row[6] === "archived"));
});

test("一括移行は計画ハッシュ不一致なら許可を消費せず書き込まない", () => {
  const fixture = createAuthorizationContext([], {
    migrationEnabled: true,
    approvedPlanHash: "DIFFERENT_PLAN"
  });
  const before = fixture.permissionSheet.values.map((row) => row.slice());

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUTHORIZATION_MIGRATION_PLAN_CHANGED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
  assert.equal(fixture.propertyValues.AUTHORIZATION_MIGRATION_ENABLED, "true");
  assert.equal(fixture.authorizationLogs.length, 0);
});

test("一括移行は差分0件の空計画を実行しない", () => {
  const usersData = [{
    internal_user_id: "U-1",
    status: "active",
    role: "developer",
    email: "developer@example.com",
    person_type: "internal",
    allowed_modules: []
  }];
  const seed = createAuthorizationContext([], { usersData });
  const desiredRows = Array.from(
    seed.context.buildAuthorizationLegacyAssignmentMigrationPlan_().additions,
    (item, index) => [
      `PA-${index + 1}`,
      item.internal_user_id,
      item.module_code,
      item.capability_code,
      item.scope_type,
      item.scope_value,
      "active", "", "", "", "", ""
    ]
  );
  const fixture = createAuthorizationContext(desiredRows, {
    usersData,
    migrationEnabled: true
  });
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.equal(preview.summary.ok, true);
  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUTHORIZATION_MIGRATION_NOT_REQUIRED/
  );
  assert.equal(fixture.propertyValues.AUTHORIZATION_MIGRATION_ENABLED, "true");
  assert.equal(fixture.authorizationLogs.length, 0);
});

test("一括移行は理由を権限割当シートへ安全な文字列として保存する", () => {
  const fixture = createAuthorizationContext([
    ["PA-KEEP", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""],
    ["PA-DUP", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    migrationEnabled: true,
    migrationReason: "=IMPORTDATA(\"https://example.invalid\")"
  });
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  fixture.context.runAuthorizationLegacyAssignmentMigrationApply();

  const memoIndex = assignmentHeaders.indexOf("memo");
  const updatedByIndex = assignmentHeaders.indexOf("updated_by");
  assert.ok(fixture.permissionSheet.values.slice(1).filter(
    (row) => row[updatedByIndex] === "U-1"
  ).every(
    (row) => String(row[memoIndex]).startsWith("'=")
  ));
  assert.ok(fixture.permissionSheet.values.some(
    (row) => row[0] === "PA-DUP" && String(row[memoIndex]).startsWith("'=")
  ));
});

test("一括移行はsuccess監査ログ失敗時に追加とアーカイブを復元する", () => {
  const usersData = [{
    internal_user_id: "U-1",
    status: "active",
    role: "developer",
    email: "developer@example.com",
    person_type: "internal",
    allowed_modules: []
  }];
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    usersData,
    migrationEnabled: true,
    failMigrationSuccessLog: true
  });
  const before = fixture.permissionSheet.values.map((row) => row.slice());
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUDIT_WRITE_FAILED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
  assert.equal(fixture.propertyValues.AUTHORIZATION_MIGRATION_ENABLED, "false");
  assert.equal(fixture.authorizationLogs.at(-1).result, "error");
  assert.equal(fixture.authorizationLogs.at(-1).after.restored, true);
});

test("一括移行は途中書込み失敗時にも追加済み行を復元する", () => {
  const fixture = createAuthorizationContext([], {
    migrationEnabled: true,
    failMigrationAppendAt: 2
  });
  const before = fixture.permissionSheet.values.map((row) => row.slice());
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /APPEND_FAILED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
  assert.equal(fixture.propertyValues.AUTHORIZATION_MIGRATION_ENABLED, "false");
  assert.equal(fixture.authorizationLogs.at(-1).result, "error");
  assert.equal(fixture.authorizationLogs.at(-1).after.restored, true);
});

test("一括移行は復元失敗をrecovery_requiredとして返す", () => {
  const usersData = [{
    internal_user_id: "U-1",
    status: "active",
    role: "developer",
    email: "developer@example.com",
    person_type: "internal",
    allowed_modules: []
  }];
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    usersData,
    migrationEnabled: true,
    failMigrationSuccessLog: true,
    failMigrationRestore: true
  });
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUTHORIZATION_MIGRATION_RECOVERY_REQUIRED/
  );
  assert.equal(fixture.propertyValues.AUTHORIZATION_MIGRATION_ENABLED, "false");
  assert.equal(fixture.authorizationLogs.at(-1).result, "recovery_required");
  assert.equal(fixture.authorizationLogs.at(-1).error_code, "AUTHORIZATION_MIGRATION_RECOVERY_REQUIRED");
});

test("一括移行は事後整合性監査失敗時に追加とアーカイブを復元する", () => {
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    migrationEnabled: true,
    failMigrationPostIntegrity: true
  });
  const before = fixture.permissionSheet.values.map((row) => row.slice());
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /INTEGRITY_FAILED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
  assert.equal(fixture.authorizationLogs.at(-1).result, "error");
});

test("一括移行は事後計画検証失敗時に追加とアーカイブを復元する", () => {
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], { migrationEnabled: true });
  const before = fixture.permissionSheet.values.map((row) => row.slice());
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;
  const originalBuild = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_;
  let buildCount = 0;
  fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_ = () => {
    buildCount += 1;
    const plan = originalBuild();
    if (buildCount === 2) plan.summary.ok = false;
    return plan;
  };

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUTHORIZATION_MIGRATION_POST_VERIFY_FAILED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
});

test("一括移行はアーカイブ対象が計画後に変われば書込み前に拒否する", () => {
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    migrationEnabled: true,
    mutateArchiveTargetOnRead: true
  });
  const before = fixture.permissionSheet.values.map((row) => row.slice());
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUTHORIZATION_MIGRATION_TARGET_CHANGED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
});

test("一括移行の復元は移行中に追加された無関係な行を削除しない", () => {
  const foreignRow = [
    "PA-FOREIGN", "U-X", "pmo", "", "", "", "archived", "", "", "", "", "manual"
  ];
  const fixture = createAuthorizationContext([], {
    migrationEnabled: true,
    failMigrationSuccessLog: true,
    injectForeignAfterAppendAt: 1,
    foreignRow
  });
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUDIT_WRITE_FAILED/
  );
  assert.deepEqual(fixture.permissionSheet.values, [assignmentHeaders, foreignRow]);
});

test("一括移行の復元はアーカイブ後に別変更された行を上書きしない", () => {
  const usersData = [{
    internal_user_id: "U-1", status: "active", role: "developer",
    email: "developer@example.com", person_type: "internal", allowed_modules: []
  }];
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    usersData,
    migrationEnabled: true,
    failMigrationSuccessLog: true,
    injectArchiveConcurrentChange: true
  });
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUTHORIZATION_MIGRATION_RECOVERY_REQUIRED/
  );
  const row = fixture.permissionSheet.values.find((item) => item[0] === "PA-EXTRA");
  assert.equal(row[6], "archived");
  assert.equal(row[8], "2099-12-31");
  assert.equal(fixture.authorizationLogs.at(-1).result, "recovery_required");
});

test("一括移行はアーカイブ書込み前の失敗を復元済みとしてerror終端にする", () => {
  const usersData = [{
    internal_user_id: "U-1", status: "active", role: "developer",
    email: "developer@example.com", person_type: "internal", allowed_modules: []
  }];
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-1", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    usersData,
    migrationEnabled: true,
    failMigrationArchiveWrite: true
  });
  const before = fixture.permissionSheet.values.map((row) => row.slice());
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /ARCHIVE_WRITE_FAILED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
  assert.equal(fixture.authorizationLogs.at(-1).result, "error");
  assert.equal(fixture.authorizationLogs.at(-1).after.restored, true);
});

test("一括移行は追加削除失敗でもアーカイブ復元を試みる", () => {
  const fixture = createAuthorizationContext([
    ["PA-EXTRA", "U-2", "shift", "shift.view.self", "self", "", "active", "", "", "", "", ""]
  ], {
    usersData: [{
      internal_user_id: "U-1", status: "active", role: "developer",
      email: "developer@example.com", person_type: "internal",
      allowed_modules: ["ordercase", "shift"], ordercase_permission: "edit",
      shiftbuilder_permission: "self"
    }, {
      internal_user_id: "U-2", status: "active", role: "member",
      email: "member@example.com", person_type: "internal", allowed_modules: []
    }, {
      internal_user_id: "U-3", status: "active", role: "member",
      email: "member3@example.com", person_type: "internal",
      allowed_modules: ["ordercase"], ordercase_permission: "edit"
    }],
    migrationEnabled: true,
    failMigrationSuccessLog: true,
    failMigrationDeleteRows: true
  });
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  assert.ok(preview.summary.additions > 0);
  assert.ok(preview.summary.archives > 0);
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    (error) => {
      assert.equal(error.code, "AUTHORIZATION_MIGRATION_RECOVERY_REQUIRED");
      assert.equal(error.rollback_error_code, "AUTHORIZATION_MIGRATION_ROLLBACK_FAILED");
      assert.deepEqual(Array.from(error.rollback_error_codes), ["DELETE_FAILED"]);
      return true;
    }
  );
  assert.equal(fixture.authorizationLogs.at(-1).result, "recovery_required");
  assert.deepEqual(
    Array.from(fixture.authorizationLogs.at(-1).after.rollback_error_codes),
    ["DELETE_FAILED"]
  );
  assert.equal(fixture.permissionSheet.values.find((row) => row[0] === "PA-EXTRA")[6], "active");
});

test("一括移行は実監査ログのsuccessアンカー保存失敗後に復元しerrorを終端にする", () => {
  const fixture = createAuthorizationContext([], {
    migrationEnabled: true,
    useRealAuthorizationLog: true,
    failAuditAnchorAt: 2
  });
  const before = fixture.permissionSheet.values.map((row) => row.slice());
  const preview = fixture.context.buildAuthorizationLegacyAssignmentMigrationPlan_();
  fixture.propertyValues.AUTHORIZATION_MIGRATION_APPROVED_PLAN_HASH = preview.summary.plan_hash;

  assert.throws(
    () => fixture.context.runAuthorizationLegacyAssignmentMigrationApply(),
    /AUDIT_ANCHOR_WRITE_FAILED/
  );
  assert.deepEqual(fixture.permissionSheet.values, before);
  const resultIndex = authorizationLogHeaders.indexOf("result");
  assert.deepEqual(
    fixture.authorizationLogSheet.values.slice(1).map((row) => row[resultIndex]),
    ["started", "success", "error"]
  );
  assert.equal(fixture.context.verifyAuthorizationChangeLogIntegrity_().healthy, true);
});
