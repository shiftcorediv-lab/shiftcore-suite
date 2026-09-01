const EXACT_SESSION_KEYS = Object.freeze([
  "shiftcore_user",
  "shiftcore_signup_email",
  "shiftcore_portal_user",
  "shiftcore_report_context",
  "ordercase_force_list_refresh"
]);

const SESSION_KEY_PREFIXES = Object.freeze([
  "shiftcore_shiftbuilder_bootstrap:",
  "shiftbuilder-read-v1:"
]);

export function clearShiftCoreSessionState(storage) {
  let target = storage;
  try {
    target ||= globalThis.sessionStorage;
    if (!target) return;
    EXACT_SESSION_KEYS.forEach(key => target.removeItem(key));
    for (let index = target.length - 1; index >= 0; index -= 1) {
      const key = target.key(index);
      if (key && SESSION_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
        target.removeItem(key);
      }
    }
  } catch (_) {
    // Firebaseのログアウト後は、Storageが利用不可でも画面遷移を妨げない。
  }
}
