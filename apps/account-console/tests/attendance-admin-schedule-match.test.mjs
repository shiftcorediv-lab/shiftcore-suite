import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../backend/attendance-apps-script/Code.gs', import.meta.url), 'utf8');
const schedule = { schedule_id: 'SA-TEST', employee_code: 'TEST-1', email: '', '勤務日': '2026-09-08', '予定開始': '10:00', '予定終了': '18:00' };
const record = { record_id: 'R-TEST', schedule_id: 'SA-TEST', employee_code: 'TEST-1', email: 'test@example.com', '勤務日': '2026-09-08', '実終了': '2026-09-08T22:52:00+09:00' };
function context() { const c = vm.createContext({}); vm.runInContext(source,c); return c; }
test('終了前でも出発・最寄り到着・入店の各段階を管理画面へ返す', () => {
  const c = context();
  let savedReports = [];
  let savedRecords = [];
  c.today_ = () => '2026-09-08'; c.nowIso_ = () => '2026-09-08T10:00:00+09:00';
  c.getSchedules_ = () => [schedule];
  c.rows_ = name => ({ '勤怠記録': savedRecords, '現場報告': savedReports }[name] || []);
  c.canViewPreciseLocation_ = () => false; c.settings_ = () => ({});
  for (const [index, type] of ['出発', '最寄り到着', '入店'].entries()) {
    savedReports.push({ schedule_id: schedule.schedule_id, '勤務日': '2026-09-08', '報告者メール': record.email, '報告種別': type, '報告日時': `2026-09-08T0${7 + index}:00:00+09:00` });
    if (type === '入店') savedRecords = [{ ...record, '実開始': '2026-09-08T09:00:00+09:00', '実終了': '', '状態': '稼働中' }];
    const result = c.getAdminDashboard_({ role: 'admin' }, 'TEST');
    assert.equal(result.people.length, 1, `${type}: 同じ予定は1行`);
    assert.deepEqual(Array.from(result.people[0].fieldReports, r => r['報告種別']), savedReports.map(r => r['報告種別']));
    assert.equal(result.people[0].record?.['実終了'] || '', '', `${type}: 終了報告はまだない`);
    if (type === '入店') assert.equal(result.people[0].record['状態'], '稼働中');
    else assert.equal(result.people[0].record, null);
  }
});
test('メールなし予定と保存済み打刻を配置IDで1行に統合し各報告を表示する', () => {
  const c = context();
  const reports = ['出発','最寄り到着','入店'].map(type => ({ schedule_id: schedule.schedule_id, '勤務日': '2026-09-08', '報告者メール': record.email, '報告種別': type }));
  c.today_ = () => '2026-09-08'; c.nowIso_ = () => '2026-09-08T23:01:00+09:00'; c.getSchedules_ = () => [schedule];
  c.rows_ = name => ({ '勤怠記録': [record], '現場報告': reports }[name] || []);
  c.canViewPreciseLocation_ = () => false; c.settings_ = () => ({});
  const result = c.getAdminDashboard_({ role: 'admin' }, 'TEST');
  assert.equal(result.people.length,1);
  assert.equal(result.people[0].schedule['予定開始'],'10:00');
  assert.equal(result.people[0].record.record_id,record.record_id);
  assert.equal(result.people[0].fieldReports.length,3);
});
test('別配置・矛盾する本人情報は統合しない', () => {
  const c = context();
  assert.equal(c.recordMatchesSchedule_({...record,schedule_id:'OTHER'},schedule,[schedule]),false);
  assert.equal(c.recordMatchesSchedule_({...record,employee_code:'OTHER'},schedule,[schedule]),false);
  assert.equal(c.recordMatchesSchedule_(record,{...schedule,email:'other@example.com'},[schedule]),false);
  assert.equal(c.fieldReportMatchesSchedule_({schedule_id:'OTHER','報告者メール':record.email},schedule,[schedule]),false);
  assert.equal(c.fieldReportMatchesSchedule_({schedule_id:schedule.schedule_id,'報告者メール':'other@example.com'},{...schedule,email:record.email},[schedule]),false);
});
test('配置IDのない旧記録はメール一致かつ予定が一意な場合のみ統合する', () => {
  const c = context(); const old = {...record,schedule_id:''}; const plan = {...schedule,email:record.email};
  assert.equal(c.recordMatchesSchedule_(old,plan,[plan]),true);
  assert.equal(c.recordMatchesSchedule_(old,plan,[plan,{...plan,schedule_id:'OTHER'}]),false);
  assert.equal(c.recordMatchesSchedule_({...old,email:''},schedule,[schedule]),false);
});
