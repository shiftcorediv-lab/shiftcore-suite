declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AP_WEBHOOK_SECRET?: string;
    AP_ACCOUNT_API_URL?: string;
    AP_ATTENDANCE_API_URL?: string;
  }
}
