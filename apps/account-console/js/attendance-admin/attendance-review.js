const JST_LOCAL_DATE_TIME = /^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

export function buildReviewPayload(request, decision, reason = "") {
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("承認または却下を指定してください。");
  }
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
  const text = String(value);
  if (/^\d{2}:\d{2}$/.test(text)) return text;
  if (!/[T ]\d{2}:\d{2}/.test(text)) return "—";
  const date = parseJapanDateTime(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(date);
}

function parseJapanDateTime(value) {
  const text = String(value);
  const local = text.match(JST_LOCAL_DATE_TIME);
  if (!local) return new Date(text);
  const [, year, month, day, hour, minute, second = "00", fraction = ""] = local;
  const milliseconds = fraction ? `.${fraction.padEnd(3, "0").slice(0, 3)}` : "";
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${milliseconds}+09:00`);
}
