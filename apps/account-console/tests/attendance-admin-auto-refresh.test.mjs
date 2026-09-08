import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/attendance-admin/main.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const snapshot = { people: [], requests: [], settings: { end_warning_time: '19:00' } };
function setup() {
  const elements = new Map(), timers = new Map(), listeners = {}, requests = [];
  let authCallback, overlays = 0, timerId = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', open: false, classList: { toggle() {} }, handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; } });
    return elements.get(id);
  };
  const document = { hidden: false, activeElement: null, getElementById: element, addEventListener: (event, fn) => { listeners[event] = fn; }, querySelectorAll: () => [], createElement: () => ({ textContent: '', innerHTML: '' }) };
  const c = vm.createContext({ document, auth: {}, onAuthStateChanged: (_, fn) => { authCallback = fn; },
    attendanceRequest: action => new Promise((resolve, reject) => requests.push({ action, resolve, reject })),
    window: { PortalLoading: { begin: () => { overlays++; return () => {}; } }, location: { replace() {} } },
    location: { replace() {} }, setActivity: (el, busy, text) => { el.textContent = text; },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    buildReviewPayload: () => ({}), formatCorrectionReason: () => '', day: x => x, t: x => x });
  vm.runInContext(source, c);
  const evaluate = code => vm.runInContext(code, c);
  return { c, evaluate, document, element, timers, listeners, requests, overlays: () => overlays,
    async start() { authCallback({}); requests[0].resolve(snapshot); await evaluate('inFlight'); },
    async tick() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); },
    logout() { authCallback(null); } };
}
test('自動更新は30秒・オーバーレイなし、手動連打と通信を重ねない', async () => {
  const h = setup(); await h.start();
  assert.equal([...h.timers.values()][0].ms, 30000);
  await h.tick();
  const pending = h.evaluate('load()');
  assert.equal(h.requests.length, 2);
  assert.equal(h.overlays(), 1);
  h.requests[1].resolve(snapshot); await pending;
  assert.equal(h.timers.size, 1);
});
test('非表示・入力中・確認ダイアログ中・書込み中は取得しない', async () => {
  const h = setup(); await h.start();
  for (const blocked of ['document.hidden=true', 'document.activeElement={matches:()=>true}', '$("reviewDialog").open=true', 'writing=true']) {
    h.evaluate(blocked); await h.evaluate('load({background:true})');
    assert.equal(h.requests.length, 1);
    h.evaluate('document.hidden=false;document.activeElement=null;$("reviewDialog").open=false;writing=false');
  }
});
test('通信途中に入力を始めたら画面を差し替えず、復帰時には取得する', async () => {
  const h = setup(); await h.start();
  const before = h.element('summary').innerHTML;
  const pending = h.evaluate('load({background:true})');
  h.document.activeElement = { matches: () => true };
  h.requests[1].resolve({ ...snapshot, people: [{ record: { 状態: '稼働中' } }] }); await pending;
  assert.equal(h.element('summary').innerHTML, before);
  h.document.activeElement = null;
  h.document.hidden = true; h.listeners.visibilitychange(); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.listeners.visibilitychange(); assert.equal(h.requests.length, 3);
  h.requests[2].resolve(snapshot); await h.evaluate('inFlight');
});
test('未保存の通知時刻・検索条件を更新で消さない', async () => {
  const h = setup(); await h.start();
  h.element('endWarningTime').value = '20:15'; h.element('endWarningTime').handlers.input();
  h.element('searchInput').value = '細見';
  const pending = h.evaluate('load({background:true})'); h.requests[1].resolve(snapshot); await pending;
  assert.equal(h.element('endWarningTime').value, '20:15');
  assert.equal(h.element('searchInput').value, '細見');
});
test('通信失敗は前回表示を維持して古い情報と明示し、次回に復旧する', async () => {
  const h = setup(); await h.start(); const before = h.element('summary').innerHTML;
  let pending = h.evaluate('load({background:true})'); h.requests[1].reject(new Error('offline')); await pending;
  assert.equal(h.element('summary').innerHTML, before);
  assert.match(h.element('message').textContent, /前回取得時点/);
  pending = h.evaluate('load({background:true})'); h.requests[2].resolve(snapshot); await pending;
  assert.match(h.element('message').textContent, /最新情報/);
});
test('ログアウト後の遅い応答を表示せず、再更新しない', async () => {
  const h = setup(); await h.start(); const pending = h.evaluate('load({background:true})');
  h.logout(); h.requests[1].resolve(snapshot); await pending;
  assert.equal(h.timers.size, 0);
});
test('保存失敗の警告を自動更新で消さず、手動確認後に再開する', async () => {
  const h = setup(); await h.start();
  const save = h.element('saveTimeBtn').handlers.click();
  h.requests[1].reject(new Error('保存結果不明')); await save;
  assert.equal(h.timers.size, 0);
  await h.evaluate('load({background:true})');
  assert.equal(h.requests.length, 2);
  assert.match(h.element('message').textContent, /保存結果不明/);
  const pending = h.evaluate('load()'); h.requests[2].resolve(snapshot); await pending;
  assert.equal(h.timers.size, 1);
});
test('自動更新中に設定保存しても古い取得結果を表示せず、保存後に再取得する', async () => {
  const h = setup(); await h.start();
  const pending = h.evaluate('load({background:true})');
  h.element('endWarningTime').value = '20:00';
  const save = h.element('saveTimeBtn').handlers.click();
  h.requests[1].resolve(snapshot); await pending;
  assert.equal(h.element('endWarningTime').value, '20:00');
  h.requests[2].resolve({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests[3].action, 'getAdminDashboard');
  h.requests[3].resolve({ ...snapshot, settings: { end_warning_time: '20:00' } }); await save;
  assert.equal(h.element('endWarningTime').value, '20:00');
});
