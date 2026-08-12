// ===== 設定ここから =====
const SPREADSHEET_ID = "1nYHb1qEe9NpG_RfP-r6FjnYwg_nhD-tTfp0gqD3xdvY";

const USERS_SHEET_NAME = "users_master";
const ACCOUNT_CHANGE_LOGS_SHEET_NAME = "account_change_logs";
const PERMISSION_ASSIGNMENTS_SHEET_NAME = "permission_assignments";
const AUTHORIZATION_SHADOW_LOGS_SHEET_NAME = "authorization_shadow_logs";
const AUTHORIZATION_CHANGE_LOGS_SHEET_NAME = "authorization_change_logs";

const ORGANIZATION_LEVELS = [
  "member",
  "leader",
  "manager",
  "executive"
];

const ORGANIZATION_LEVEL_RANKS = {
  member: 1,
  leader: 2,
  manager: 3,
  executive: 4
};

const ORGANIZATION_USER_HEADERS = [
  "organization_level",
  "direct_manager_user_id",
  "executive_reviewer_user_id",
  "organization_version",
  "organization_updated_at",
  "organization_updated_by"
];

const AUTHORIZATION_CHANGE_LOG_HEADERS = [
  "authorization_change_log_id",
  "authorization_event_id",
  "occurred_at",
  "event_type",
  "request_id",
  "actor_internal_user_id",
  "target_internal_user_id",
  "reviewer_internal_user_id",
  "before_json",
  "after_json",
  "reason",
  "result",
  "error_code",
  "source",
  "previous_log_hash",
  "log_hash"
];

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
const ORGANIZATION_SHADOW_ENABLED_PROPERTY = "ORGANIZATION_SHADOW_ENABLED";
const ORGANIZATION_BOOTSTRAP_ENABLED_PROPERTY = "ORGANIZATION_BOOTSTRAP_ENABLED";
const ORGANIZATION_BOOTSTRAP_EXECUTIVE_IDS_PROPERTY = "ORGANIZATION_BOOTSTRAP_EXECUTIVE_IDS";
const ORGANIZATION_BOOTSTRAP_ACTOR_ID_PROPERTY = "ORGANIZATION_BOOTSTRAP_ACTOR_ID";
const ORGANIZATION_BOOTSTRAP_REASON_PROPERTY = "ORGANIZATION_BOOTSTRAP_REASON";
const AUTHORIZATION_LOG_ANCHOR_PROPERTY = "AUTHORIZATION_LOG_ANCHOR";
const AUTHORIZATION_INTEGRITY_RECIPIENT_IDS_PROPERTY = "AUTHORIZATION_INTEGRITY_RECIPIENT_IDS";
const AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS_PROPERTY = "AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS";
const AUTHORIZATION_INDEPENDENT_AUDITOR_ID_PROPERTY = "AUTHORIZATION_INDEPENDENT_AUDITOR_ID";
const AUTHORIZATION_ANCHOR_REBASE_ENABLED_PROPERTY = "AUTHORIZATION_ANCHOR_REBASE_ENABLED";
const AUTHORIZATION_ANCHOR_REBASE_REASON_PROPERTY = "AUTHORIZATION_ANCHOR_REBASE_REASON";
const AUTHORIZATION_INTEGRITY_TRIGGER_FUNCTION = "runAuthorizationIntegrityAudit";
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
    "ordercase.case.create",
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
