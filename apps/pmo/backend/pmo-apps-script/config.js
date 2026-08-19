// =========================
// 設定ここから
// =========================
const SETTINGS = {
  SPREADSHEET_ID: "1HJJmL1y2qY_BHU9jUzR8i5nOg2Z6D_6jAixbyLio6X8",
  REQUEST_SHEET_NAME: "希望休申請",
  MONTHLY_SHEET_PREFIX: "希望休一覧_",
    SHIFTCORE_LOGIN_API_URL: "https://shiftcore-login-proxy.shiftcore-div.workers.dev/",

  REQUEST_HEADER: [
    "submitted_at",          // A
    "target_year_month",     // B
    "user_id",               // C
    "display_name",          // D
    "off_dates",             // E
    "memo",                  // F
    "application_id",        // G
    "is_latest",             // H
    "reflected_to_monthly",  // I
    "reflected_at",          // J
    "submit_type",           // K
    "employee_code"          // L
  ],

  MONTHLY_STATUS_COLUMN: 1,     // A列: 提出状況
  MONTHLY_NAME_COLUMN: 2,       // B列: スタッフ名
  MONTHLY_CODE_COLUMN: 3,       // C列: employee_code
  MONTHLY_DAY_START_COLUMN: 5,  // E列: 1日

  EXCLUDED_WORK_STATUSES_FOR_MONTHLY: ["off"],

  // ShiftCore 側の roster API
  SHIFTCORE_ROSTER_API_URL: "https://script.google.com/macros/s/AKfycbx83rAzXDfQPJUEu9tX4dpULH4QHYUoqfaTnfzzySkW3KjGVbcH4tnq9PKCCvfuEx6eRA/exec",

  TIMEZONE: "Asia/Tokyo"
};
// =========================
// 設定ここまで
// =========================