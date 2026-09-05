function normalizeRuleIds(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\s,、]+/);
  return [...new Set(source.map(item => String(item || "").trim().toLowerCase()).filter(Boolean))];
}

function candidateIdentifiers(candidate = {}) {
  return [
    candidate.internal_user_id,
    candidate.internalUserId,
    candidate.account_code,
    candidate.accountCode,
    candidate.employee_code,
    candidate.employeeCode
  ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean);
}

export function getCaseMemberPreference(caseItem = {}, candidate = {}) {
  const identifiers = candidateIdentifiers(candidate);
  const preferredIds = normalizeRuleIds(
    caseItem.preferred_member_ids || caseItem.preferredMemberIds
  );
  const ngIds = normalizeRuleIds(caseItem.ng_member_ids || caseItem.ngMemberIds);
  const matches = ruleIds => identifiers.some(identifier => ruleIds.includes(identifier));
  const isNg = matches(ngIds);

  return {
    isPreferred: !isNg && matches(preferredIds),
    isNg
  };
}
