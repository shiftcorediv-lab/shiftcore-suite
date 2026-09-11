import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('月間予定は本人の今月分だけを既存取得から返し、他人や追加の列を含めない', () => {
  const c = vm.createContext({});
  vm.runInContext(read('../backend/attendance-apps-script/Code.gs'), c);
  const rows = [
    {email:'test@example.com', '勤務日':'2026-09-01', '稼働場所':'店舗A', '予定開始':'10:00', '予定終了':'18:00', privateNote:'secret'},
    {email:'other@example.com', '勤務日':'2026-09-01', '稼働場所':'他人'},
    {email:'test@example.com', '勤務日':'2026-08-31'},
    {email:'test@example.com', '勤務日':'2026-10-01'}
  ];
  const reads = [];
  c.rows_ = name => { reads.push(name); return name === '稼働予定' ? rows : []; };
  c.dashboardScheduleSyncCache_ = () => null;
  c.dashboardReferenceCacheKey_ = () => 'test';
  c.dashboardRecordData_ = () => ({data:[],cacheStatus:'disabled'});
  c.today_ = () => '2026-09-12'; c.nowIso_ = () => '2026-09-12T00:00:00Z';
  c.findPendingOvernightReport_ = () => null;
  const result = c.getDashboardData_({email:'test@example.com',role:'developer'});
  assert.deepEqual(JSON.parse(JSON.stringify(result.monthSchedules)), [{'勤務日':'2026-09-01','稼働場所':'店舗A','予定開始':'10:00','予定終了':'18:00'}]);
  assert.equal(reads.filter(name => name === '稼働予定').length, 1);
});
test('月末・うるう年・同日の複数予定を落とさず日付にまとめる', () => {
  const c = vm.createContext({});
  vm.runInContext(read('../js/dashboard/monthly-shift.js').replace(/^export /gm,''), c);
  for (const [date, count] of [['2026-02-12',28],['2028-02-12',29],['2026-09-12',30],['2026-12-12',31]]) {
    assert.equal(c.monthlyShiftDays(date,[]).length,count);
  }
  const days = c.monthlyShiftDays('2026-09-12',[{'勤務日':'2026-09-30'},{'勤務日':'2026-09-30'},{'勤務日':'2026-10-01'}]);
  assert.equal(days[29].items.length,2);
  assert.equal(days[0].items.length,0);
  assert.equal(c.monthlyShiftDays('invalid',[]).length,0);
});
