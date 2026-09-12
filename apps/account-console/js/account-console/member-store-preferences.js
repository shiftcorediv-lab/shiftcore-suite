import {memberStorePreferences} from './api.js?v=20260913-demo2';

export async function openMemberStorePreferences(user, idToken) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '本人の希望店舗・NG店舗');
  dialog.style.cssText = 'width:min(680px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #dce4ef;border-radius:16px;padding:24px';
  const title = document.createElement('h2');
  title.textContent = `${user.display_name || user.name}：本人の希望店舗・NG店舗`;
  const info = document.createElement('p');
  info.textContent = '取引先からの指名・NGとは別の本人希望です。編集できるのは本人の直属管理者だけです。';
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  const fields = document.createElement('div');
  const save = document.createElement('button'); save.type = 'button'; save.textContent = '本人希望を保存'; save.disabled = true;
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる';
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  dialog.append(title, info, message, fields, save, close); document.body.append(dialog); dialog.showModal();
  let baseline = ''; let busy = false;
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  const selects = {};
  try {
    message.textContent = '希望店舗と直属管理者を確認しています…';
    const result = await memberStorePreferences(idToken, user.internal_user_id);
    if (!result.ok) throw new Error(result.message || '取得できませんでした');
    if (!dialog.isConnected) return;
    baseline = result.baseline;
    for (const [key, label] of [['preferred','本人希望店舗'], ['ng','本人NG店舗（非推奨）']]) {
      const heading = document.createElement('label'); heading.textContent = label;
      const select = document.createElement('select'); select.multiple = true; select.size = 7;
      select.setAttribute('aria-label', label); select.style.width = '100%'; select.disabled = !result.canEdit;
      result.stores.forEach(store => {
        const option = document.createElement('option'); option.value = store.id;
        option.textContent = `${store.name} / ${store.agency || '代理店未設定'}${store.status !== 'active' ? '（アーカイブ）' : ''}`;
        option.selected = result.preferences[key].includes(store.id); select.append(option);
      });
      heading.append(select); fields.append(heading); selects[key] = select;
    }
    save.disabled = !result.canEdit;
    message.textContent = result.canEdit ? '複数選択・選択解除はMacでは⌘、WindowsではCtrlを押しながらクリックします。保存するまで変更は反映されません。' : '閲覧のみです。編集は本人の直属管理者が行います。';
  } catch (error) { message.textContent = error.message; }
  save.addEventListener('click', async () => {
    if (busy || save.disabled) return;
    busy = true; save.disabled = true; close.disabled = true;
    try {
      const preferences = Object.fromEntries(Object.entries(selects).map(([key, select]) => [key, Array.from(select.selectedOptions, option => option.value)]));
      if (preferences.preferred.some(id => preferences.ng.includes(id))) throw new Error('同じ店舗を本人希望と本人NGの両方には登録できません');
      message.textContent = '保存しています…';
      const result = await memberStorePreferences(idToken, user.internal_user_id, {baseline, preferences});
      if (!result.ok) throw new Error(result.message || '保存できませんでした');
      baseline = result.baseline;
      message.textContent = '保存しました。シフトは再読み込みすると反映されます。';
    } catch (error) { message.textContent = `${error.message} 保存結果が不明な場合は閉じて再度開き、確認してください。`; }
    finally { busy = false; save.disabled = false; close.disabled = false; }
  });
}
