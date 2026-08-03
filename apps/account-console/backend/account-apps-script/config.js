// ===== 設定ここから =====
const SPREADSHEET_ID = "1nYHb1qEe9NpG_RfP-r6FjnYwg_nhD-tTfp0gqD3xdvY";

const USERS_SHEET_NAME = "users_master";
const ACCOUNT_CHANGE_LOGS_SHEET_NAME = "account_change_logs";

// ===== Account Console 設定ここから =====
const ACCOUNT_CONSOLE_MODULE_KEY = "account_console";

const VALID_ACCOUNT_ROLES = [
  "developer",
  "admin",
  "member",
  "partner_individual",
  "partner_company_admin",
  "agency"
];

const VALID_ACCOUNT_STATUSES = [
  "active",
  "inactive"
];

const VALID_ORDERCASE_PERMISSIONS = [
  "",
  "all",
  "edit",
  "view",
  "view_without_amount"
];

const VALID_SHIFTBUILDER_PERMISSIONS = [
  "",
  "all",
  "manager",
  "edit",
  "view",
  "self"
];

// ===== 人員区分・契約区分設定ここから =====
const VALID_PERSON_TYPES = [
  "",
  "internal",
  "alliance_individual",
  "alliance_company_member",
  "agency"
];

const VALID_AFFILIATION_TYPES = [
  "",
  "another_member",
  "external_member"
];

const VALID_CONTRACT_TYPES = [
  "",
  "regular_employee",
  "contract_employee",
  "part_time",
  "intern",
  "freelance",
  "alliance",
  "outsourced",
  "none"
];

const VALID_ENGAGEMENT_STATUSES = [
  "",
  "active",
  "inactive"
];
// ===== 人員区分・契約区分設定ここまで =====

// ===== Account Console 設定ここまで =====


// ===== 登録申請設定ここから =====
const SIGNUP_REQUESTS_SHEET_NAME = "user_signup_requests";

// 管理者通知先
// まだ未定なら空配列のままでOK
const SIGNUP_NOTIFICATION_EMAILS = [
  "hosomi@another-inc.jp",
  "shiftcore.div@gmail.com"
  // "example@example.com",
  // "example2@example.com"
];
// ===== 登録申請設定ここまで =====

const PMO_V2_FRONT_URL = "https://shiftcorediv-lab.github.io/pickmyoff_v2_front/";
// ===== 設定ここまで =====
