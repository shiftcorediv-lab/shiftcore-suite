// ===== リクエスト行検索ここから =====
function findSignupRequestRowById_(requestId) {
  const sheet = getSignupRequestsSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const headerMap = getHeaderMap_(sheet);
  const requestIdCol = headerMap["request_id"];

  if (!requestIdCol) {
    throw new Error("request_id 列が見つかりません");
  }

  const values = sheet.getRange(2, requestIdCol, lastRow - 1, 1).getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    if (normalizeText(values[i][0]) === normalizeText(requestId)) {
      return i + 2;
    }
  }

  return 0;
}
// ===== リクエスト行検索ここまで =====


// ===== リクエスト取得ここから =====
function getSignupRequestById_(requestId) {
  const row = findSignupRequestRowById_(requestId);

  if (!row) {
    return null;
  }

  const sheet = getSignupRequestsSheet();
  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];

  return {
    row: row,
    request_id: values[(headerMap["request_id"] || 1) - 1] || "",
    submitted_at: values[(headerMap["submitted_at"] || 1) - 1] || "",
    applicant_email: values[(headerMap["applicant_email"] || 1) - 1] || "",
    applicant_name: values[(headerMap["applicant_name"] || 1) - 1] || "",
    applicant_type: values[(headerMap["applicant_type"] || 1) - 1] || "",
    company_name: values[(headerMap["company_name"] || 1) - 1] || "",
    phone: values[(headerMap["phone"] || 1) - 1] || "",
    note: values[(headerMap["note"] || 1) - 1] || "",
    request_status: values[(headerMap["request_status"] || 1) - 1] || "",
    reviewed_at: values[(headerMap["reviewed_at"] || 1) - 1] || "",
    reviewed_by: values[(headerMap["reviewed_by"] || 1) - 1] || "",
    linked_internal_user_id: values[(headerMap["linked_internal_user_id"] || 1) - 1] || ""
  };
}
// ===== リクエスト取得ここまで =====
