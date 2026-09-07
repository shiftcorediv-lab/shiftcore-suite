// メンバー側からもマスターの同じ列を更新する。別の配置ルール台帳は作らない。
function changeMemberRuleLists_(current, payload) {
  const keys = normalizeStoreMemberIds_(payload.member_keys).split(',').filter(Boolean);
  if (!keys.length || keys.length > 2) throw new Error('対象メンバーのIDを確認してください。');
  if (['none', 'preferred', 'ng'].indexOf(payload.rule) === -1) throw new Error('配置ルールが不正です。');
  const columns = ['preferred_member_ids', 'ng_member_ids'];
  columns.forEach(function(key) {
    if (typeof payload[key] !== 'string' || String(current[key] || '') !== payload[key]) {
      throw new Error('別の画面で配置ルールが更新されました。再読み込みして確認してください。');
    }
  });
  const aliases = keys.map(function(key) { return key.toLowerCase(); });
  const result = {};
  columns.forEach(function(column) {
    const ids = normalizeStoreMemberIds_(current[column]).split(',').filter(function(id) {
      return id && aliases.indexOf(id.toLowerCase()) === -1;
    });
    if ((column === 'preferred_member_ids' && payload.rule === 'preferred') || (column === 'ng_member_ids' && payload.rule === 'ng')) ids.push(keys[0]);
    result[column] = normalizeStoreMemberIds_(ids);
  });
  return result;
}

function updateMemberAssignmentRule_(payload) {
  const scope = payload.scope;
  if (scope !== 'store' && scope !== 'agency') throw new Error('店舗または代理店を指定してください。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheetForUpdate_(scope === 'store' ? SHEET_STORES_MASTER : SHEET_AGENCIES_MASTER);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function(value) { return String(value).trim(); });
    const idIndex = headers.indexOf(scope + '_id');
    const index = values.findIndex(function(row, i) { return i > 0 && String(row[idIndex]) === String(payload.target_id); });
    if (idIndex < 0 || index < 1) throw new Error('対象マスターが見つかりません。');
    const current = {};
    headers.forEach(function(header, i) { current[header] = values[index][i]; });
    if (String(current.status || 'active') !== 'active') throw new Error('アーカイブ済みのマスターは編集できません。');
    const changes = changeMemberRuleLists_(current, payload);
    // 既存の2列だけを変更し、店舗情報・他メンバー・理由を上書きしない。
    Object.keys(changes).forEach(function(key) {
      if (headers.indexOf(key) < 0) throw new Error('配置ルール列がありません。マスター設定を確認してください。');
    });
    Object.keys(changes).forEach(function(key) {
      values[index][headers.indexOf(key)] = changes[key];
    });
    if (headers.includes('updated_at')) values[index][headers.indexOf('updated_at')] = new Date();
    sheet.getRange(index + 1, 1, 1, headers.length).setValues([values[index]]);
    SpreadsheetApp.flush();
    return changes;
  } finally { lock.releaseLock(); }
}
