import { memberManagementLinks } from '../../../common/member-management-links.mjs';
import { escapeHtml } from './utils.js?v=20260801-authfix-1';

let dispose = () => {};
export function closePersonnelProfiles() { dispose(); }
export function bindPersonnelProfiles(root, people, month) {
  dispose();
  const controller = new AbortController();
  const options = {signal: controller.signal};
  const popup = document.createElement('div');
  popup.className = 'personnel-profile-popover';
  popup.hidden = true;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'メンバー管理');
  document.body.append(popup);
  let timer;
  let anchor;
  const close = () => {
    clearTimeout(timer);
    popup.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
  };
  const leave = () => { clearTimeout(timer); timer = setTimeout(close, 250); };
  const open = (button, person) => {
    clearTimeout(timer);
    anchor?.setAttribute('aria-expanded', 'false');
    anchor = button;
    anchor.setAttribute('aria-expanded', 'true');
    const links = memberManagementLinks(person, month);
    popup.innerHTML = `<strong>${escapeHtml(person.displayName)}</strong><p>${escapeHtml(person.accountCode || person.id)}</p>
      <a href="${escapeHtml(links.account)}" target="_blank" rel="noopener">メンバーを開く</a>
      <a href="${escapeHtml(links.off)}" target="_blank" rel="noopener">希望休管理</a>
      <a href="${escapeHtml(links.rules)}" target="_blank" rel="noopener">指名・NGを編集</a>
      <small>編集権限は各管理画面で確認します。保存後はシフトを再読み込みしてください。</small>`;
    popup.hidden = false;
    const rect = button.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.right + 8, window.innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - popup.offsetHeight - 8))}px`;
  };
  root.querySelectorAll('[data-member-profile]').forEach(button => {
    const person = people.find(item => item.id === button.dataset.memberProfile);
    if (!person) return;
    button.addEventListener('mouseenter', () => open(button, person), options);
    button.addEventListener('mouseleave', leave, options);
    button.addEventListener('focus', () => open(button, person), options);
    button.addEventListener('click', () => { open(button, person); popup.querySelector('a')?.focus(); }, options);
    button.addEventListener('blur', event => { if (!popup.contains(event.relatedTarget)) leave(); }, options);
  });
  popup.addEventListener('mouseenter', () => clearTimeout(timer), options);
  popup.addEventListener('mouseleave', leave, options);
  popup.addEventListener('focusin', () => clearTimeout(timer), options);
  popup.addEventListener('focusout', event => { if (!popup.contains(event.relatedTarget)) leave(); }, options);
  document.addEventListener('pointerdown', event => { if (!popup.contains(event.target) && !anchor?.contains(event.target)) close(); }, options);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popup.hidden) { anchor?.focus(); close(); }
  }, options);
  window.addEventListener('resize', close, options);
  dispose = () => { close(); controller.abort(); popup.remove(); };
}
