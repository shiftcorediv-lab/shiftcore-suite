function pmoDeadline_(targetYearMonth) {
  const ym = normalizeText(targetYearMonth);
  if (!/^\d{4}-\d{2}$/.test(ym) || !isValidYearMonth(ym)) throw new Error("対象月が不正です");
  const parts = ym.split("-").map(Number);
  const previous = new Date(Date.UTC(parts[0], parts[1] - 2, 14));
  const defaultAt = previous.toISOString().slice(0, 10) + "T23:59:00+09:00";
  const value = PropertiesService.getScriptProperties().getProperty("PMO_DEADLINE_" + ym);
  return { targetYearMonth: ym, deadlineAt: value || defaultAt, defaultAt: defaultAt, serverNow: new Date().toISOString() };
}

function getPmoDeadlineSecure(targetYearMonth, idToken) {
  const auth = requirePmoActiveUser_(idToken);
  if (!auth.success) return auth;
  return Object.assign({ success: true }, pmoDeadline_(targetYearMonth));
}

function updatePmoDeadlineSecure(body) {
  const auth = requirePmoAdminUser_(body.idToken);
  if (!auth.success) return auth;
  const current = pmoDeadline_(body.targetYearMonth);
  if (body.expectedDeadlineAt !== current.deadlineAt) throw new Error("締切が他の操作で変更されました。再読込してください。");
  const value = normalizeText(body.deadlineAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(value) || !isFinite(Date.parse(value)) ||
      Utilities.formatDate(new Date(value), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ssXXX") !== value) throw new Error("締切日時が不正です");
  // API入口のScriptLock内。月単位の設定だけ変更し、提出原本や提出可否は変更しない。
  PropertiesService.getScriptProperties().setProperty("PMO_DEADLINE_" + current.targetYearMonth, value);
  return Object.assign({ success: true }, pmoDeadline_(current.targetYearMonth));
}
