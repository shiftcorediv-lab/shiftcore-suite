const JST_LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

export function buildReviewPayload(request, decision, reason = "") {
  const expectedRequestVersion = Number(request?.request_version);
  if (!Number.isInteger(expectedRequestVersion) || expectedRequestVersion < 1) {
    throw new Error("申請の版情報を確認できません。画面を更新してください。");
  }
  return {
    requestId: request.request_id,
    expectedRequestVersion,
    decision: decision === "approve" ? "承認" : "却下",
    reason
  };
}

export function formatJapanDay(value) {
  if (!value) return "—";
  const date = parseJapanDateTime(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" }).format(date);
}

export function formatJapanTime(value) {
  if (!value) return "—";
  const date = parseJapanDateTime(value);
  return Number.isNaN(date.getTime())
    ? String(value).slice(-5)
    : new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(date);
}

function parseJapanDateTime(value) {
  const text = String(value);
  return new Date(JST_LOCAL_DATE_TIME.test(text) ? `${text}+09:00` : text);
}
