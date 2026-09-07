const ruleParams = new URLSearchParams(location.search);
const ruleMemberKeys = [ruleParams.get('target_member'), ruleParams.get('member_code')].filter(Boolean);
const ruleState = {store: [], agency: [], busy: false};
const ruleMessage = document.getElementById('ruleMessage');
function getMemberRule(row) {
  const aliases = ruleMemberKeys.map(value => value.toLowerCase());
  const contains = value => String(value || '').split(/[\s,、]+/).some(id => aliases.includes(id.toLowerCase()));
  // 旧データで両方登録されていれば、黙って片方に見せない。
  const preferred = contains(row.preferred_member_ids), ng = contains(row.ng_member_ids);
  return preferred && ng ? 'conflict' : ng ? 'ng' : preferred ? 'preferred' : 'none';
}
function renderMemberRules() {
  const keyword = document.getElementById('ruleSearch').value.trim().toLowerCase();
  for (const scope of ['store', 'agency']) {
    const host = document.getElementById(scope + 'Rules');
    const rows = ruleState[scope].filter(row => String(row.status || 'active') === 'active' && [row.store_name, row.agency_name].join(' ').toLowerCase().includes(keyword));
    host.innerHTML = rows.map(row => {
      const name = scope === 'store' ? row.store_name : row.agency_name;
      const rule = getMemberRule(row);
      const url = new URL(scope === 'store' ? 'stores.html' : 'agencies.html', location.href);
      url.searchParams.set('edit_id', row[scope + '_id']);
      const href = window.ShiftCoreEnvironment.withEnvironment(url.href);
      return `<article class="rule-row"><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(scope === 'store' ? row.agency_name : '代理店全体に適用')}</small><small>${escapeHtml([row.preferred_note && '指名理由：' + row.preferred_note, row.ng_note && 'NG理由：' + row.ng_note].filter(Boolean).join(' / '))}</small><a href="${escapeHtml(href)}" target="_blank" rel="noopener">マスター・共通理由を編集</a></div>
        <select aria-label="${escapeHtml(name)}の配置ルール" data-rule-id="${escapeHtml(row[scope + '_id'])}">${rule === 'conflict' ? '<option value="conflict">指名・NGが重複</option>' : ''}${[['none','指定なし'],['preferred','指名'],['ng','NG（非推奨）']].map(([value,label]) => `<option value="${value}" ${rule === value ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="primary-button" type="button" data-save-rule="${escapeHtml(row[scope + '_id'])}">保存</button></article>`;
    }).join('') || '<p>該当するマスターはありません。</p>';
    host.querySelectorAll('[data-save-rule]').forEach(button => button.addEventListener('click', () => saveMemberRule(scope, button)));
  }
}
async function loadMemberRules() {
  if (ruleState.busy) return;
  ruleState.busy = true;
  const done = window.PortalLoading.begin('指名・NGを読み込んでいます…');
  try {
    const permission = await fetchApiJson('getOrderCasePermission');
    if (!permission.ok) throw new Error(permission.message || '権限情報を取得できませんでした。再読み込みしてください。');
    if (!permission.data?.can_edit) throw new Error('指名・NGの編集にはオーダーの編集権限が必要です。');
    const results = await Promise.all([fetchApiJson('listStoresMaster'), fetchApiJson('listAgenciesMaster')]);
    const failed = results.find(result => !result.ok);
    if (failed) throw new Error(failed.message || 'マスターを取得できませんでした。再読み込みしてください。');
    ruleState.store = results[0].data || []; ruleState.agency = results[1].data || [];
    renderMemberRules(); ruleMessage.textContent = '最新の指名・NGを読み込みました。';
  } catch (error) { ruleMessage.textContent = error.message; }
  finally { ruleState.busy = false; done(); }
}
async function saveMemberRule(scope, button) {
  if (ruleState.busy) return;
  const row = ruleState[scope].find(item => item[scope + '_id'] === button.dataset.saveRule);
  const rule = button.closest('article').querySelector('select').value;
  if (!['none','preferred','ng'].includes(rule)) { ruleMessage.textContent = '配置ルールを選び直してください。'; return; }
  ruleState.busy = true;
  const done = window.PortalLoading.begin('指名・NGを保存しています…');
  try {
    const result = await postOrderCaseAction('updateMemberAssignmentRule', {scope, target_id: row[scope + '_id'], member_keys: ruleMemberKeys, rule, preferred_member_ids: String(row.preferred_member_ids || ''), ng_member_ids: String(row.ng_member_ids || '')});
    if (!result.ok) throw new Error(result.message || '保存できませんでした。');
    Object.assign(row, result.data); renderMemberRules();
    ruleMessage.textContent = '保存しました。マスターと共通の情報を更新済みです。シフトは再読み込みしてください。';
  } catch (error) { ruleMessage.textContent = error.message; }
  finally { ruleState.busy = false; done(); }
}
document.addEventListener('DOMContentLoaded', () => {
  renderOrderCaseHeader('', 'メンバーの配置ルール');
  document.getElementById('memberTitle').textContent = `${ruleParams.get('member_name') || 'メンバー'}（${ruleMemberKeys.join(' / ')}）の指名・NG`;
  if (!ruleMemberKeys.length) { ruleMessage.textContent = 'メンバーまたはシフトの人員名から開いてください。'; return; }
  document.getElementById('ruleSearch').addEventListener('input', renderMemberRules);
  document.getElementById('reloadRules').addEventListener('click', loadMemberRules);
  loadMemberRules();
});
