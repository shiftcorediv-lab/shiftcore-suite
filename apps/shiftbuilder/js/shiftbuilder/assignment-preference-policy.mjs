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
  const matches = ruleIds => identifiers.some(identifier => ruleIds.includes(identifier));
  const storePreferred = matches(normalizeRuleIds(
    caseItem.store_preferred_member_ids || caseItem.storePreferredMemberIds || caseItem.preferred_member_ids || caseItem.preferredMemberIds
  ));
  const storeNg = matches(normalizeRuleIds(
    caseItem.store_ng_member_ids || caseItem.storeNgMemberIds || caseItem.ng_member_ids || caseItem.ngMemberIds
  ));
  const agencyPreferred = matches(normalizeRuleIds(
    caseItem.agency_preferred_member_ids || caseItem.agencyPreferredMemberIds
  ));
  const agencyNg = matches(normalizeRuleIds(
    caseItem.agency_ng_member_ids || caseItem.agencyNgMemberIds
  ));
  let effectiveType = "normal";
  if (storeNg) effectiveType = "store-ng";
  else if (storePreferred) effectiveType = "store-preferred";
  else if (agencyNg) effectiveType = "agency-ng";
  else if (agencyPreferred) effectiveType = "agency-preferred";

  const badgeLabels = [];
  if (storePreferred) badgeLabels.push("店舗指名");
  if (agencyPreferred) badgeLabels.push("代理店指名");
  if (storeNg) badgeLabels.push("店舗NG");
  if (agencyNg) badgeLabels.push("代理店NG");

  return {
    isStorePreferred: storePreferred,
    isAgencyPreferred: agencyPreferred,
    isStoreNg: storeNg,
    isAgencyNg: agencyNg,
    isPreferred: effectiveType.endsWith("preferred"),
    isNg: effectiveType.endsWith("ng"),
    effectiveType,
    badgeLabels
  };
}
