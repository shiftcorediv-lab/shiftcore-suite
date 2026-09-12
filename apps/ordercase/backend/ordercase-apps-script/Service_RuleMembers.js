// 配置ルール選択に必要な氏名・識別子だけを返し、メール等は公開しない。
function listRuleMembers_() {
  const id = orderCaseRequiredConfig_('ACCOUNT_SPREADSHEET_ID', '1nYHb1qEe9NpG_RfP-r6FjnYwg_nhD-tTfp0gqD3xdvY');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('users_master');
  if (!sheet) throw new Error('メンバー名簿を取得できません。');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  if (!headers.includes('internal_user_id')) throw new Error('メンバー名簿の形式を確認してください。');
  return values.map(row => {
    const value = key => String(row[headers.indexOf(key)] || '').trim();
    return {id:value('internal_user_id'), code:value('employee_code') || value('account_code'),
      name:value('display_name') || value('name') || [value('family_name'),value('given_name')].filter(Boolean).join(' '),
      status:value('status').toLowerCase(), role:value('role').toLowerCase()};
  }).filter(row => row.id && row.role !== 'developer').map(({role,...row})=>row);
}
