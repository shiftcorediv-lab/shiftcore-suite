import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const headers = [
  "authorization_change_log_id", "authorization_event_id", "occurred_at",
  "event_type", "request_id", "actor_internal_user_id",
  "target_internal_user_id", "reviewer_internal_user_id", "before_json",
  "after_json", "reason", "result", "error_code", "source",
  "previous_log_hash", "log_hash"
];

function createContext(options = {}) {
  const rows = [headers.slice()];
  const properties = { ...(options.recoveryProperties || {}) };
  const triggers = [];
  const sentEmails = [];
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length,
    getRange(row, column, rowCount, columnCount) {
      return {
        getDisplayValues: () => rows
          .slice(row - 1, row - 1 + (rowCount || 1))
          .map((item) => item.slice(column - 1, column - 1 + (columnCount || 1))),
        getDisplayValue: () => String(rows[row - 1]?.[column - 1] || "")
      };
    },
    getDataRange: () => ({
      getDisplayValues: () => rows.map((item) => item.slice())
    }),
    appendRow: (row) => rows.push(row.slice())
  };
  const context = vm.createContext({
    SPREADSHEET_ID: "SHEET",
    AUTHORIZATION_CHANGE_LOGS_SHEET_NAME: "authorization_change_logs",
    AUTHORIZATION_CHANGE_LOG_HEADERS: headers,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => options.missingSheet ? null : sheet
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ ...properties }),
        getProperty: (key) => properties[key] || "",
        setProperty: (key, value) => { properties[key] = String(value); },
        deleteProperty: (key) => { delete properties[key]; }
      })
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      newTrigger: (handler) => ({
        timeBased: () => ({
          everyDays: () => ({
            atHour: () => ({
              create: () => triggers.push({ getHandlerFunction: () => handler })
            })
          })
        })
      }),
      deleteTrigger: (trigger) => {
        const index = triggers.indexOf(trigger);
        if (index >= 0) triggers.splice(index, 1);
      }
    },
    MailApp: { sendEmail: (message) => sentEmails.push({ ...message }) },
    Utilities: {
      getUuid: () => "UUID",
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (_algorithm, source) => [source.length % 255],
      base64EncodeWebSafe: (digest) => `HASH-${digest[0]}`
    },
    console
  });
  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  context.AUTHORIZATION_LOG_ANCHOR_PROPERTY = "AUTHORIZATION_LOG_ANCHOR";
  context.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS_PROPERTY = "AUTHORIZATION_INTEGRITY_RECIPIENT_IDS";
  context.AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS_PROPERTY = "AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS";
  context.AUTHORIZATION_INDEPENDENT_AUDITOR_ID_PROPERTY = "AUTHORIZATION_INDEPENDENT_AUDITOR_ID";
  context.AUTHORIZATION_ANCHOR_REBASE_ENABLED_PROPERTY = "AUTHORIZATION_ANCHOR_REBASE_ENABLED";
  context.AUTHORIZATION_ANCHOR_REBASE_REASON_PROPERTY = "AUTHORIZATION_ANCHOR_REBASE_REASON";
  context.AUTHORIZATION_INTEGRITY_TRIGGER_FUNCTION = "runAuthorizationIntegrityAudit";
  context.getNowIsoStringJst = () => "2026-08-10T12:00:00";
  context.getUsersData = () => options.users || [
    { internal_user_id: "U-E1", email: "executive1@example.com", status: "active" },
    { internal_user_id: "U-E2", email: "executive2@example.com", status: "active" },
    { internal_user_id: "U-A1", email: "auditor@example.com", status: "active" }
  ];
  context.validateOrganizationGraph_ = () => {
    if (options.organizationGraphError) throw new Error("graph read failed");
    return options.organizationValidation || { healthy: true, errors: [] };
  };
  context.escapeAuthorizationSheetText_ = (value) => {
    const text = context.normalizeText(value);
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  };
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/authorization_change_logs.js", import.meta.url),
      "utf8"
    ),
    context
  );
  return { context, rows, properties, triggers, sentEmails };
}

test("開始ログと完了ログを同じイベントIDでハッシュ連結する", () => {
  const { context, rows } = createContext();
  const started = context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    actor_internal_user_id: "U-E1",
    target_internal_user_id: "U-M1",
    reason: "組織変更",
    result: "started"
  });
  const success = context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    actor_internal_user_id: "U-E1",
    target_internal_user_id: "U-M1",
    reason: "組織変更",
    result: "success"
  });

  assert.equal(rows.length, 3);
  assert.equal(success.authorization_event_id, started.authorization_event_id);
  assert.equal(success.previous_log_hash, started.log_hash);
});

test("監査ログシートがなければ業務更新前に拒否できるエラーを返す", () => {
  const { context } = createContext({ missingSheet: true });

  assert.throws(
    () => context.appendAuthorizationChangeLog_({
      authorization_event_id: "ACE-1",
      event_type: "organization.update",
      result: "started"
    }),
    (error) => error.code === "AUDIT_WRITE_FAILED"
  );
});

test("監査ログのハッシュ連鎖と完了イベントを検証する", () => {
  const { context } = createContext();
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    result: "started"
  });
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    result: "success"
  });

  const result = context.verifyAuthorizationChangeLogIntegrity_();
  assert.equal(result.healthy, true);
  assert.deepEqual(Array.from(result.incomplete_events), []);
});

test("Sheetsが監査日時を表示形式へ変換してもハッシュを検証できる", () => {
  const { context, rows } = createContext();
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.schema.initialize",
    result: "success"
  });
  rows[1][headers.indexOf("occurred_at")] = "2026-08-10 12:00:00";

  const result = context.verifyAuthorizationChangeLogIntegrity_();
  assert.equal(result.healthy, true);
});

test("startedのままのイベントと復旧プロパティを異常として検出する", () => {
  const { context } = createContext({
    recoveryProperties: { AUTHORIZATION_RECOVERY_ACE_2: "{}" }
  });
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    result: "started"
  });

  const result = context.verifyAuthorizationChangeLogIntegrity_();
  assert.equal(result.healthy, false);
  assert.deepEqual(Array.from(result.incomplete_events), ["ACE-1"]);
  assert.deepEqual(Array.from(result.recovery_required), ["AUTHORIZATION_RECOVERY_ACE_2"]);
});

test("監査ログの改変をハッシュ不一致として検出する", () => {
  const { context, rows } = createContext();
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    result: "success"
  });
  rows[1][headers.indexOf("reason")] = "改変";

  const result = context.verifyAuthorizationChangeLogIntegrity_();
  assert.equal(result.healthy, false);
  assert.ok(result.errors.some((item) => item.startsWith("HASH_VALUE_MISMATCH:")));
});

test("監査ログ末尾の切り詰めを別保存アンカーで検出する", () => {
  const { context, rows } = createContext();
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    result: "started"
  });
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    result: "success"
  });
  rows.pop();

  const result = context.verifyAuthorizationChangeLogIntegrity_();
  assert.equal(result.healthy, false);
  assert.ok(result.errors.includes("AUDIT_ANCHOR_ROW_COUNT_MISMATCH"));
  assert.ok(result.errors.includes("AUDIT_ANCHOR_HASH_MISMATCH"));
});

test("日次整合性検査トリガーは通知先必須かつ重複作成しない", () => {
  const { context, properties, triggers } = createContext();
  assert.throws(
    () => context.setupAuthorizationIntegrityDailyTrigger(),
    (error) => error.code === "AUTHORIZATION_RECIPIENT_IDS_REQUIRED"
  );
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";
  properties.AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS = "U-E1,U-E2";
  properties.AUTHORIZATION_INDEPENDENT_AUDITOR_ID = "U-A1";
  assert.equal(context.setupAuthorizationIntegrityDailyTrigger().already_exists, false);
  assert.equal(context.setupAuthorizationIntegrityDailyTrigger().already_exists, true);
  assert.equal(triggers.length, 1);
});

test("監査シートが削除されても日次検査は異常通知を試みる", () => {
  const { context, properties, sentEmails } = createContext({ missingSheet: true });
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";

  assert.throws(
    () => context.runAuthorizationIntegrityAudit(),
    (error) => error.code === "AUTHORIZATION_INTEGRITY_FAILED"
  );
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].body, /AUDIT_WRITE_FAILED/);
});

test("日次監査は組織グラフ不整合を件数だけで通知する", () => {
  const { context, properties, sentEmails } = createContext({
    organizationValidation: {
      healthy: false,
      errors: [
        { internal_user_id: "U-E1", code: "EXECUTIVE_REVIEWER_GRAPH_INVALID" },
        { internal_user_id: "U-E2", code: "EXECUTIVE_REVIEWER_GRAPH_INVALID" }
      ]
    }
  });
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";

  assert.throws(
    () => context.runAuthorizationIntegrityAudit(),
    (error) => error.code === "AUTHORIZATION_INTEGRITY_FAILED"
  );
  assert.equal(sentEmails.length, 1);
  assert.match(
    sentEmails[0].body,
    /ORGANIZATION_GRAPH_UNHEALTHY:EXECUTIVE_REVIEWER_GRAPH_INVALID:2/
  );
  assert.doesNotMatch(sentEmails[0].body, /internal_user_id|U-E1|U-E2/);
});

test("組織グラフの読取失敗も日次監査異常として通知する", () => {
  const { context, properties, sentEmails } = createContext({ organizationGraphError: true });
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";

  assert.throws(
    () => context.runAuthorizationIntegrityAudit(),
    (error) => error.code === "AUTHORIZATION_INTEGRITY_FAILED"
  );
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].body, /ORGANIZATION_GRAPH_AUDIT_FAILED/);
});

test("人員マスターの有効な通知対象を解決し試験通知を送れる", () => {
  const { context, properties, sentEmails } = createContext();
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "UNKNOWN";
  assert.throws(
    () => context.sendAuthorizationIntegrityTestNotification(),
    (error) => error.code === "AUTHORIZATION_RECIPIENT_INVALID"
  );
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";
  assert.equal(context.sendAuthorizationIntegrityTestNotification().success, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to.split(",").length, 3);
});

test("役員2名と別の独立監査担当が通知対象に含まれることを検証する", () => {
  const { context, properties } = createContext();
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";
  assert.equal(
    context.assertAuthorizationIntegrityRecipientRoles_(["U-E1", "U-E2"], "U-A1"),
    true
  );
  assert.throws(
    () => context.assertAuthorizationIntegrityRecipientRoles_(["U-E1", "U-E2"], "U-E2"),
    (error) => error.code === "AUTHORIZATION_RECIPIENT_ROLE_MISMATCH"
  );
});

test("通知対象1名が無効でも残る有効宛先へ異常通知する", () => {
  const { context, properties, sentEmails } = createContext({
    users: [
      { internal_user_id: "U-E1", email: "executive1@example.com", status: "inactive" },
      { internal_user_id: "U-E2", email: "executive2@example.com", status: "active" },
      { internal_user_id: "U-A1", email: "auditor@example.com", status: "active" }
    ]
  });
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";
  context.notifyAuthorizationIntegrityFailure_({ errors: ["TEST"] });

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "executive2@example.com,auditor@example.com");
  assert.match(sentEmails[0].body, /"unavailable_recipient_count":1/);
  assert.doesNotMatch(sentEmails[0].body, /U-E1/);
});

test("日次トリガー作成時に役員2名と独立監査担当を強制する", () => {
  const { context, properties } = createContext();
  properties.AUTHORIZATION_INTEGRITY_RECIPIENT_IDS = "U-E1,U-E2,U-A1";
  properties.AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS = "U-E1,U-E2";
  properties.AUTHORIZATION_INDEPENDENT_AUDITOR_ID = "U-E2";
  assert.throws(
    () => context.setupAuthorizationIntegrityDailyTrigger(),
    (error) => error.code === "AUTHORIZATION_RECIPIENT_ROLE_MISMATCH"
  );
});

test("アンカー再基線化は承認理由必須で連鎖正常時だけ実行する", () => {
  const { context, rows, properties } = createContext();
  context.appendAuthorizationChangeLog_({
    authorization_event_id: "ACE-1",
    event_type: "organization.update",
    result: "success"
  });
  delete properties.AUTHORIZATION_LOG_ANCHOR;
  assert.throws(
    () => context.rebaselineAuthorizationLogAnchor(),
    (error) => error.code === "AUTHORIZATION_ANCHOR_REBASE_NOT_APPROVED"
  );
  properties.AUTHORIZATION_ANCHOR_REBASE_ENABLED = "true";
  properties.AUTHORIZATION_ANCHOR_REBASE_REASON = "障害復旧";
  const rebaseline = context.rebaselineAuthorizationLogAnchor();
  assert.equal(rebaseline.success, true);
  assert.ok(properties.AUTHORIZATION_LOG_ANCHOR);
  assert.equal(properties.AUTHORIZATION_ANCHOR_REBASE_ENABLED, "false");
  assert.equal(properties.AUTHORIZATION_ANCHOR_REBASE_REASON, undefined);
  assert.equal(rows.length, 3);
  assert.equal(
    rows[2][headers.indexOf("event_type")],
    "audit.anchor.rebaseline"
  );
  assert.equal(rows[2][headers.indexOf("reason")], "障害復旧");
});
