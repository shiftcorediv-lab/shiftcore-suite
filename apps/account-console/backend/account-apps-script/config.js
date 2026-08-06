// ===== 設定ここから =====
const SPREADSHEET_ID = "1nYHb1qEe9NpG_RfP-r6FjnYwg_nhD-tTfp0gqD3xdvY";

const USERS_SHEET_NAME = "users_master";
const ACCOUNT_CHANGE_LOGS_SHEET_NAME = "account_change_logs";
const PERMISSION_ASSIGNMENTS_SHEET_NAME = "permission_assignments";
const AUTHORIZATION_SHADOW_LOGS_SHEET_NAME = "authorization_shadow_logs";

const PERMISSION_ASSIGNMENT_HEADERS = [
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

const AUTHORIZATION_SHADOW_LOG_HEADERS = [
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

const AUTHORIZATION_SHADOW_ENABLED_PROPERTY = "AUTHORIZATION_SHADOW_ENABLED";
const AUTHORIZATION_SHADOW_MODULE_CODES = [
  "account_console",
  "ordercase",
  "shift"
];

const VALID_PERMISSION_MODULE_CODES = [
  "account_console",
  "ordercase",
  "shift",
  "attendance"
];

const VALID_PERMISSION_SCOPE_TYPES = [
  "all",
  "organization",
  "area",
  "self"
];

const VALID_PERMISSION_CAPABILITIES_BY_MODULE = {
  account_console: [
    "account.view",
    "account.profile.edit",
    "account.permission.edit",
    "account.status.edit",
    "account.signup.review",
    "audit.view"
  ],
  ordercase: [
    "ordercase.view",
    "ordercase.amount.view",
    "ordercase.case.edit",
    "ordercase.amount.edit",
    "ordercase.rank.edit",
    "ordercase.store.edit",
    "ordercase.case.archive",
    "ordercase.store.archive"
  ],
  shift: [
    "shift.view.all",
    "shift.view.self",
    "shift.draft.edit",
    "shift.confirm",
    "shift.publish",
    "shift.distribute",
    "shift.reopen",
    "shift.override"
  ],
  attendance: [
    "attendance.self.report",
    "attendance.team.view",
    "attendance.request.review",
    "attendance.settings.edit",
    "attendance.location.precise.view"
  ]
};

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
