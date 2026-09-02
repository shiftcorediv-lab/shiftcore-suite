export const firebaseConfig = {
  apiKey: "AIzaSyAXDhMT1IP1xQ9f0WiOIjmmfBHoQDWZ0dI",
  authDomain: "shiftcore-div.firebaseapp.com",
  projectId: "shiftcore-div",
  storageBucket: "shiftcore-div.firebasestorage.app",
  messagingSenderId: "882342275588",
  appId: "1:882342275588:web:bab610608d1bc00453e351"
};

export const LOGIN_PAGE_URL = "./index.html";
export const PMO_APPLY_URL = "../pmo/";
export const ATTENDANCE_API_URL = window.ShiftCoreEnvironment.endpoint(
  "attendanceApi",
  "https://script.google.com/macros/s/AKfycbzYSk46G7ZZx55vQIOC5pRqyA15rn15ORbTe_f72PVxmj5v0EISBbL4tpGA_ehOtnBnAQ/exec"
);
export const LOCATION_CONSENT_VERSION = "2026-08-31-v2";

export const MODULE_NAME_MAP = {
  account: "メンバー",
  account_console: "メンバー",
  pmo: "オフ",
  ordercase: "オーダー",
  order_case: "オーダー",
  shift: "シフト",
  shiftbuilder: "シフト"
};

export const MODULE_DESCRIPTION_MAP = {
  account: "メンバー登録・申請・権限管理",
  account_console: "メンバー登録・申請・権限管理",
  pmo: "希望休管理",
  ordercase: "案件管理",
  order_case: "案件管理",
  shift: "シフト・稼働予定管理",
  shiftbuilder: "シフト・稼働予定管理"
};
