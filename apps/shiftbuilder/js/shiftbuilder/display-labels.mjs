function normalizeText(value) {
  return String(value || "").trim();
}

export function getCompactMemberLabel(member = {}, fallback = "") {
  const familyName = normalizeText(member.family_name || member.familyName);
  const givenName = normalizeText(member.given_name || member.givenName);
  const fallbackName = normalizeText(
    member.display_name ||
      member.displayName ||
      member.name ||
      fallback
  );

  if (familyName && givenName) {
    return `${familyName} ${Array.from(givenName)[0]}`;
  }

  return familyName || fallbackName || "氏名未設定";
}

export function getCompactCaseId(caseId) {
  const normalizedCaseId = normalizeText(caseId);

  if (!normalizedCaseId) {
    return "";
  }

  const segments = normalizedCaseId.split("-").filter(Boolean);
  return segments.length > 1 ? `#${segments.at(-1)}` : normalizedCaseId;
}

export function getCaseIdentityLabel(assignment = {}) {
  const caseId = normalizeText(assignment.caseId || assignment.case_id);
  const title = normalizeText(
    assignment.caseDisplayTitle ||
      assignment.caseTitle ||
      assignment.title
  );

  if (title && caseId && title !== caseId) {
    return `${title}（${caseId}）`;
  }

  return title || caseId || "案件名未設定";
}
