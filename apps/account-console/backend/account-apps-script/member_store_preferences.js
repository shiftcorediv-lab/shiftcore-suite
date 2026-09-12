// 本人の希望は取引先の指名・NGとは分離し、店舗IDで保存する。
function canEditMemberStorePreferences_(operator, target) {
  const actor = normalizeText(operator && operator.internal_user_id);
  return !!actor && normalizeText(operator.status) === 'active' &&
    actor !== normalizeText(target.internal_user_id) &&
    actor === normalizeText(target.direct_manager_user_id);
}

function memberStoreCatalog_() {
  const id = accountRequiredConfig_('ORDERCASE_SPREADSHEET_ID', '1NvPCKfzasWo76PqWyG-5uwUqkyLultrSAy09kGuNM1k');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('stores_master');
  if (!sheet) throw new Error('店舗マスターを取得できません');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.map(row => {
    const value = key => normalizeText(row[headers.indexOf(key)]);
    return {id: value('store_id'), name: value('store_name'), agency: value('agency_name'), status: value('status')};
  }).filter(store => store.id);
}

function normalizeMemberStorePreferences_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('希望店舗の形式が不正です');
  const result = {};
  ['preferred', 'ng'].forEach(key => {
    if (!Array.isArray(value[key]) || value[key].length > 500) throw new Error('希望店舗の件数・形式が不正です');
    result[key] = [...new Set(value[key].map(item => normalizeText(item)).filter(Boolean))].sort();
  });
  if (result.preferred.some(id => result.ng.includes(id))) throw new Error('同じ店舗を本人希望と本人NGの両方には登録できません');
  return result;
}

function accountConsoleMemberStorePreferences(body) {
  const operator = requireAccountConsoleOperator_(body);
  const targetId = normalizeText(body.target_user_id);
  const save = body.action === 'accountConsoleSaveMemberStorePreferences';
  const lock = save ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(10000)) throw new Error('保存処理が混み合っています。再度お試しください');
  try {
    const sheet = getUsersSheet();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(normalizeText);
    const idColumn = headers.indexOf('internal_user_id');
    const index = values.findIndex((row, i) => i > 0 && normalizeText(row[idColumn]) === targetId);
    if (idColumn < 0 || index < 1) throw new Error('対象メンバーが見つかりません');
    const target = {};
    headers.forEach((key, i) => { target[key] = values[index][i]; });
    const canEdit = canEditMemberStorePreferences_(operator, target);
    if (save && !canEdit) throw new Error('本人の直属管理者だけが希望店舗・NG店舗を編集できます');
    let column = headers.indexOf('member_store_preferences');
    const current = column < 0 ? '' : String(values[index][column] || '');
    const stores = memberStoreCatalog_();
    let preferences = normalizeMemberStorePreferences_(current ? JSON.parse(current) : {preferred: [], ng: []});
    if (save) {
      if (String(body.baseline || '') !== current) throw new Error('別の画面で更新されました。再読み込みしてください');
      preferences = normalizeMemberStorePreferences_(body.preferences);
      if ([...preferences.preferred, ...preferences.ng].some(id => !stores.some(store => store.id === id))) throw new Error('店舗マスターに存在しない店舗が含まれています');
      if (column < 0) {
        column = headers.length;
        if (sheet.getMaxColumns() <= column) sheet.insertColumnAfter(sheet.getMaxColumns());
        sheet.getRange(1, column + 1).setValue('member_store_preferences');
      }
      sheet.getRange(index + 1, column + 1).setValue(JSON.stringify(preferences));
      SpreadsheetApp.flush();
    }
    return {ok:true, success:true, canEdit, preferences, baseline: save ? JSON.stringify(preferences) : current, stores};
  } finally { if (lock) lock.releaseLock(); }
}
