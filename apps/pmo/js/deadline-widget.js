import { deadlineText } from "./deadline.mjs";
const postJson = async body => (await import("../../account-console/js/pmo-admin/api.js")).postJson(body);

export function mountDeadline(host, { editable = false, request = postJson } = {}) {
  host.classList.add('pmo-deadline');
  host.innerHTML = `<p data-deadline-label>締切を確認中…</p><strong data-countdown></strong><p>締切後も提出・修正できます。</p>${editable ? '<label>締切日時（日本時間）<input type="datetime-local" data-deadline-input></label><button type="button" data-deadline-save>締切を保存</button>' : ''}<button type="button" data-deadline-reload>締切を再確認</button><p role="status" data-deadline-status></p>`;
  let current = null, month = "", generation = 0, offset = 0, saving = false;
  const label = host.querySelector('[data-deadline-label]'), counter = host.querySelector('[data-countdown]'), status = host.querySelector('[data-deadline-status]');
  const input = host.querySelector('[data-deadline-input]'), save = host.querySelector('[data-deadline-save]');
  const tick = () => { counter.textContent = current ? deadlineText(current.deadlineAt, Date.now() + offset) : ""; };
  function render(result) {
    current = result;
    offset = Date.parse(result.serverNow) - Date.now();
    label.textContent = `${month}分の締切：${result.deadlineAt.slice(0, 16).replace('T', ' ')}（日本時間）`;
    if (input) input.value = result.deadlineAt.slice(0, 16);
    tick();
  }
  async function load(targetMonth) {
    month = targetMonth;
    const own = ++generation;
    current = null; tick(); label.textContent = "締切を確認中…";
    if (save) save.disabled = true;
    try {
      const result = await request({ action: "getPmoDeadlineSecure", targetYearMonth: month });
      if (own !== generation) return;
      if (!result.success) throw new Error(result.message || "締切を取得できません");
      render(result); status.textContent = "";
    } catch (error) { if (own === generation) { label.textContent = "締切を取得できません"; status.textContent = error.message; } }
    finally { if (save && own === generation) save.disabled = !current || saving; }
  }
  host.querySelector('[data-deadline-reload]').addEventListener('click', () => { if (!saving) load(month); });
  if (save) save.addEventListener('click', async () => {
    if (!current || saving || !input.value || !input.reportValidity()) return;
    const own = generation;
    saving = true; save.disabled = true;
    status.textContent = "締切を保存中…";
    try {
      const result = await request({ action: "updatePmoDeadlineSecure", targetYearMonth: month, deadlineAt: input.value + ":00+09:00", expectedDeadlineAt: current.deadlineAt });
      if (own !== generation) return;
      if (!result.success) throw new Error(result.message || "保存できません");
      render(result); status.textContent = "締切を保存しました";
    } catch (error) { if (own === generation) status.textContent = "保存結果を確認できません。再確認してから操作してください。 " + error.message; }
    finally { saving = false; save.disabled = !current; }
  });
  let timer = setInterval(tick, 1000);
  window.addEventListener('pagehide', () => { clearInterval(timer); timer = null; });
  // 戻る操作でページが復元されるとスクリプトは再実行されないため、タイマーも復帰させる。
  window.addEventListener('pageshow', () => { if (timer === null) { tick(); timer = setInterval(tick, 1000); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && month && !saving && (!input || input.value === current?.deadlineAt.slice(0,16))) load(month); });
  return { load };
}
