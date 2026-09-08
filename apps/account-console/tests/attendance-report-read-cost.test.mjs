import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../backend/attendance-apps-script/Code.gs', import.meta.url), 'utf8');
const user = { email: 'test@example.com' };
const report = { schedule_id: 'S1', '報告者メール': user.email, '勤務日': '2026-09-09', '開発予定ID': 'P1' };
function setup(unambiguous = true) {
  const c = vm.createContext({}); vm.runInContext(source, c);
  let reads = 0;
  c.dateKey_ = value => value;
  c.legacyScheduleUnambiguous_ = () => { reads++; return unambiguous; };
  return { run: reports => c.fieldReportsFor_(user, '2026-09-09', 'S1', 'P1', reports), reads: () => reads };
}
test('現行の配置IDで判定できる報告は予定一覧を追加取得しない', () => {
  const h = setup();
  const result = h.run([report, { ...report, schedule_id: 'S2' }]);
  assert.equal(result.length, 1); assert.equal(h.reads(), 0);
});
test('本人・日付・案件が違う旧記録も予定一覧を読まない', () => {
  const h = setup();
  assert.equal(h.run([{ ...report, schedule_id: '', '報告者メール': 'other@example.com' }, { ...report, schedule_id: '', '勤務日': '2026-09-08' }, { ...report, schedule_id: '', '開発予定ID': 'P2' }]).length, 0);
  assert.equal(h.reads(), 0);
});
for (const unique of [true, false]) test(`旧記録は一意性確認を維持し、複数報告でも取得1回（${unique}）`, () => {
  const h = setup(unique);
  assert.equal(h.run([{ ...report, schedule_id: '' }, { ...report, schedule_id: '' }]).length, unique ? 2 : 0);
  assert.equal(h.reads(), 1);
});
