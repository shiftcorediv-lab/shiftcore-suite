// ===== ShiftBuilder Config ここから =====

const SHIFTBUILDER_PRODUCTION_SCRIPT_ID = "1us_D5HW0Jl_uDSSFeg5N3L8y97xn_dn4kmiF4KKbUIWJJH-Pfou8lp35";

function shiftBuilderRuntimeEnvironment_() {
  if (typeof ScriptApp === "undefined" || typeof PropertiesService === "undefined") return "unit-test";
  const explicit = String(PropertiesService.getScriptProperties().getProperty("SHIFTCORE_ENVIRONMENT") || "").trim().toLowerCase();
  const scriptId = String(ScriptApp.getScriptId() || "");
  if (scriptId === SHIFTBUILDER_PRODUCTION_SCRIPT_ID) {
    if (explicit && explicit !== "production") throw new Error("本番ShiftBuilder GASの環境設定が不正です。");
    return "production";
  }
  if (explicit !== "staging") throw new Error("ShiftBuilder GASはSHIFTCORE_ENVIRONMENT=stagingの明示設定が必要です。");
  return "staging";
}

function shiftBuilderRequiredConfig_(key, productionValue) {
  const environment = shiftBuilderRuntimeEnvironment_();
  if (environment === "production" || environment === "unit-test") return productionValue;
  const value = String(PropertiesService.getScriptProperties().getProperty(key) || "").trim();
  if (!value) throw new Error("テスト環境の必須設定がありません: " + key);
  return value;
}

function sendShiftBuilderMail_(options) {
  const mail = Object.assign({}, options || {});
  if (shiftBuilderRuntimeEnvironment_() === "staging") {
    mail.to = shiftBuilderRequiredConfig_("NOTIFICATION_EMAIL_OVERRIDE", "");
    mail.cc = "";
    mail.bcc = "";
    mail.subject = "[TEST] " + String(mail.subject || "ShiftCore通知");
  }
  return MailApp.sendEmail(mail);
}

// ===== Spreadsheet IDs ここから =====
// Account Console / users_master が入っているスプレッドシート
const ACCOUNT_SPREADSHEET_ID = shiftBuilderRequiredConfig_("ACCOUNT_SPREADSHEET_ID", "1nYHb1qEe9NpG_RfP-r6FjnYwg_nhD-tTfp0gqD3xdvY");

// ShiftBuilder用スプレッドシート
// TODO: 今作成した ShiftCore_ShiftBuilder_Master のスプレッドシートIDに差し替える
const SHIFTBUILDER_SPREADSHEET_ID = shiftBuilderRequiredConfig_("SHIFTBUILDER_SPREADSHEET_ID", "1qdHuqJZVbA0CNYkZNkET8voEzXpLLxMLtUNSwZZYdr0");

// OrderCase用スプレッドシート
// TODO: OrderCase Master のスプレッドシートIDを入れる
const ORDERCASE_SPREADSHEET_ID = shiftBuilderRequiredConfig_("ORDERCASE_SPREADSHEET_ID", "1NvPCKfzasWo76PqWyG-5uwUqkyLultrSAy09kGuNM1k");

// PMO用スプレッドシート
// TODO: PickMyOff / PMO のスプレッドシートIDを入れる
const PMO_SPREADSHEET_ID = shiftBuilderRequiredConfig_("PMO_SPREADSHEET_ID", "1HJJmL1y2qY_BHU9jUzR8i5nOg2Z6D_6jAixbyLio6X8");
// ===== Spreadsheet IDs ここまで =====


// ===== Account sheets ここから =====
const USERS_MASTER_SHEET_NAME = "users_master";
// ===== Account sheets ここまで =====


// ===== ShiftBuilder sheets ここから =====
const SHIFT_MONTHS_SHEET_NAME = "shift_months";
const SHIFT_ASSIGNMENTS_SHEET_NAME = "shift_assignments";
const AVAILABILITY_EVENTS_SHEET_NAME = "availability_events";
const SHIFT_DAY_DETAILS_SHEET_NAME = "shift_day_details";
const SHIFT_INTERNAL_EVENTS_SHEET_NAME = "shift_internal_events";
const SHIFT_CONFIRMATIONS_SHEET_NAME = "shift_confirmations";
const SHIFT_AUDIT_LOGS_SHEET_NAME = "shift_audit_logs";
// ===== ShiftBuilder sheets ここまで =====


// ===== OrderCase sheets ここから =====
const ORDERCASE_CASES_SHEET_NAME = "cases";
const ORDERCASE_CASE_DATES_SHEET_NAME = "case_dates";
const ORDERCASE_AGENCIES_MASTER_SHEET_NAME = "agencies_master";
const ORDERCASE_STORES_MASTER_SHEET_NAME = "stores_master";
// ===== OrderCase sheets ここまで =====


// ===== PMO sheets ここから =====
// TODO: 実際のPMO側シート名に合わせて変更
const PMO_REQUESTS_SHEET_NAME = "希望休申請";
// ===== PMO sheets ここまで =====


// ===== module / permission ここから =====
const SHIFTBUILDER_MODULE_KEY = "shift";

const VALID_SHIFTBUILDER_PERMISSIONS = [
  "all",
  "manager",
  "edit",
  "view",
  "self"
];

const SHIFTBUILDER_EDITABLE_PERMISSIONS = [
  "all",
  "manager",
  "edit"
];
// ===== module / permission ここまで =====


// ===== Shift month status ここから =====
const SHIFT_MONTH_STATUS = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  PUBLISHED: "published",
  REVISED: "revised",
  ARCHIVED: "archived"
};
// ===== Shift month status ここまで =====


// ===== Assignment status ここから =====
const ASSIGNMENT_STATUS = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  PUBLISHED: "published",
  CHANGED: "changed",
  CANCELLED: "cancelled",
  NEEDS_REPLACEMENT: "needs_replacement",
  ARCHIVED: "archived"
};

const REPLACEMENT_STATUS = {
  NONE: "none",
  PENDING: "pending",
  REPLACED: "replaced",
  CANCELLED: "cancelled"
};
// ===== Assignment status ここまで =====


// ===== Cell status ここから =====
const CELL_STATUS = {
  UNASSIGNED: "unassigned",
  SHORTAGE: "shortage",
  COMPLETED: "completed",
  OVER: "over"
};

const CELL_STATUS_LABELS = {
  unassigned: "未アサイン",
  shortage: "不足",
  completed: "アサイン完了",
  over: "超過"
};
// ===== Cell status ここまで =====


// ===== default values ここから =====
const DEFAULT_TIME_SLOT = "full_day";
const DEFAULT_AREA = "関西";
// ===== default values ここまで =====

// ===== ShiftBuilder Config ここまで =====
