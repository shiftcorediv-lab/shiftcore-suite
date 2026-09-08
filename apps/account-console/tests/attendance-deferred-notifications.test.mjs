import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('通知後回し時は通知シートを読まず、通常取得とはキャッシュを分ける', () => {
  const c = vm.createContext({}); vm.runInContext(read('../backend/attendance-apps-script/Code.gs'), c);
  const values = new Map(), reads = [];
  const cache = { get: key => values.get(key), put: (key, value) => values.set(key, value), remove: key => values.delete(key) };
  c.dashboardScheduleSyncCache_ = () => cache;
  c.dashboardReferenceCacheKey_ = () => 'reference';
  c.dashboardRecordCacheKey_ = () => 'records';
  c.rows_ = name => { reads.push(name); return []; };
  const user = { email: 'test@example.com', role: 'developer' };
  assert.equal(c.dashboardReferenceData_(user, null, true).data.notifications, null);
  assert.equal(reads.includes('通知'), false);
  assert.equal(c.dashboardReferenceData_(user).data.notifications.length, 0);
  assert.equal(reads.filter(n => n === '通知').length, 1);
  c.invalidateDashboardReferenceCache_(user);
  assert.equal(values.size, 0);
});
test('別取得の通知も本人宛てだけ・新しい順・最大20件', () => {
  const c = vm.createContext({}); vm.runInContext(read('../backend/attendance-apps-script/Code.gs'), c);
  c.rows_ = () => Array.from({ length: 25 }, (_, i) => ({ '宛先メール': 'TEST@example.com', '作成日時': String(i).padStart(2, '0') })).concat({ '宛先メール': 'other@example.com', '作成日時': '99' });
  const notifications = c.dashboardNotifications_({ email: 'test@example.com' });
  assert.equal(notifications.length, 20);
  assert.equal(notifications[0]['作成日時'], '24');
  assert.equal(notifications[19]['作成日時'], '05');
});
test('通知取得失敗は通知欄だけに表示し、古い応答は反映しない', async () => {
  const source = read('../js/dashboard/main.js');
  const fn = source.match(/async function loadMyNotifications\([^]*?\n\}/)[0];
  const elements = { notificationBadge: {}, notificationList: { dataset: {} } };
  let reject, resolve, rendered = false;
  const c = vm.createContext({ notificationLoadVersion: 0, dashboardLoadVersion: 1, auth: { currentUser: { uid: 'U1' } },
    $: id => elements[id], setActivity() {}, renderNotifications() { rendered = true; },
    attendanceRequest: () => new Promise((yes, no) => { resolve = yes; reject = no; }) });
  vm.runInContext(fn, c);
  let pending = c.loadMyNotifications(1); reject(new Error('offline')); await pending;
  assert.equal(elements.notificationList.dataset.retry, 'true'); assert.equal(rendered, false);
  pending = c.loadMyNotifications(1); c.dashboardLoadVersion = 2; resolve({ notifications: [] }); await pending;
  assert.equal(rendered, false);
});
