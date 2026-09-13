import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { deadlineText } from '../js/deadline.mjs';

const result = (month = '2026-10') => ({ success: true, targetYearMonth: month,
  deadlineAt: '2026-09-14T23:59:00+09:00', serverNow: '2026-09-13T09:00:00+09:00' });
function setup(request) {
  const elements = new Map(), events = {}, timers = new Map();
  let timerId = 0;
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { value: '', textContent: '', disabled: false,
      addEventListener(event, handler) { this[event] = handler; }, reportValidity() { return true; } });
    return elements.get(selector);
  };
  const context = vm.createContext({ deadlineText,
    window: { addEventListener(event, handler) { events[event] = handler; } },
    document: { addEventListener() {} },
    setInterval(fn) { timers.set(++timerId, fn); return timerId; },
    clearInterval(id) { timers.delete(id); }
  });
  const source = readFileSync(new URL('../js/deadline-widget.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('export function', 'function'), context);
  const widget = context.mountDeadline({ classList: { add() {} }, querySelector: element }, { editable: true, request });
  return { widget, element: name => element(`[data-${name}]`), events, timers };
}

test('締切の月切替は遅れて返った旧月の結果を表示しない', async () => {
  const pending = [];
  const s = setup(body => new Promise(resolve => pending.push({ body, resolve })));
  const first = s.widget.load('2026-10'), second = s.widget.load('2026-11');
  pending[1].resolve(result('2026-11')); await second;
  pending[0].resolve(result('2026-10')); await first;
  assert.match(s.element('deadline-label').textContent, /^2026-11分/);
  assert.equal(s.element('deadline-save').disabled, false);
});

test('締切の取得失敗時は保存を止め、再確認で復帰する', async () => {
  let fail = true;
  const s = setup(async () => { if (fail) throw new Error('通信失敗'); return result(); });
  await s.widget.load('2026-10');
  assert.equal(s.element('deadline-save').disabled, true);
  assert.match(s.element('deadline-status').textContent, /通信失敗/);
  fail = false;
  await s.widget.load('2026-10');
  assert.equal(s.element('deadline-save').disabled, false);
  assert.equal(s.element('deadline-status').textContent, '');
});

test('締切保存の連打は二重送信せず、応答後に保存可能へ戻る', async () => {
  let count = 0, resolveSave;
  const s = setup(async body => {
    if (body.action.startsWith('get')) return result();
    count++;
    assert.equal(body.expectedDeadlineAt, result().deadlineAt);
    return new Promise(resolve => { resolveSave = resolve; });
  });
  await s.widget.load('2026-10');
  s.element('deadline-input').value = '2026-09-16T12:30';
  const save = s.element('deadline-save'), pending = save.click();
  await save.click();
  assert.equal(count, 1);
  assert.equal(save.disabled, true);
  resolveSave({ ...result(), deadlineAt: '2026-09-16T12:30:00+09:00' }); await pending;
  assert.equal(save.disabled, false);
  assert.match(s.element('deadline-label').textContent, /09-16 12:30/);
});

test('ブラウザの戻る復元でタイマーを再開し、重複起動しない', async () => {
  const s = setup(async () => result());
  await s.widget.load('2026-10');
  assert.equal(s.timers.size, 1);
  s.events.pagehide(); assert.equal(s.timers.size, 0);
  s.events.pageshow(); assert.equal(s.timers.size, 1);
  s.events.pageshow(); assert.equal(s.timers.size, 1);
});
