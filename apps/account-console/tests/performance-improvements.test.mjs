import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../backend/attendance-apps-script/Code.gs', import.meta.url), 'utf8');
const context = () => { const c = vm.createContext({ console }); vm.runInContext(source, c); return c; };

test('勤怠の先行一覧は外部シフト同期を呼ばず、最新打刻を読む', () => {
  const c = context();
  c.today_ = () => '2026-09-13'; c.nowIso_ = () => 'now';
  c.settings_ = () => ({}); c.canViewPreciseLocation_ = () => false;
  c.dashboardScheduleSyncStatus_ = () => ({status:'stale'});
  c.getSchedules_ = () => assert.fail('一覧で外部同期しない');
  const reads = [];
  c.rows_ = name => { reads.push(name); return []; };
  const result = c.getAdminDashboard_({role:'admin'}, 'TOKEN', {deferScheduleSync:true});
  assert.equal(result.ok, true);
  assert.equal(result.scheduleSync.status, 'stale');
  assert.ok(reads.includes('勤怠記録'));
  assert.ok(reads.includes('現場報告'));
});

test('実績100件でもテンプレート判定の設定表は件数比例で読み直さない', () => {
  const c = context(); const reads = {};
  c.normalizeWorkReportFilters_ = () => ({dateFrom:'2026-09-01',dateTo:'2026-09-30'});
  c.dateKey_ = v => v;
  c.rows_ = name => {
    reads[name] = (reads[name] || 0) + 1;
    if (name === '勤怠記録') return Array.from({length:100},(_,i)=>({record_id:String(i),'勤務日':'2026-09-13','実終了':'end'}));
    if (name === '実績対象案件') return [{'開発予定ID':'P', template_id:'T'}];
    if (name === '実績テンプレート') return [{template_id:'T'}];
    return [];
  };
  c.workReportContext_ = () => ({planId:'P'});
  c.workReportMappingApplies_ = () => true;
  c.matchesWorkReportFilters_ = () => true;
  c.allWorkReportItems_ = c.activeWorkReportTemplates_ = c.workReportCaseCandidates_ = () => [];
  const result = c.buildWorkReportAdminData_({});
  assert.equal(result.submissions.length,100);
  assert.equal(reads['実績対象案件'],1);
  assert.equal(reads['実績テンプレート'],1);
});

test('高速出発は同期をロック前に行い、打刻と送信待ちを同時に保存する', () => {
  const c = context(); let held=false; const reports=[]; const schedules=[{schedule_id:'S','勤務日':'2026-09-13'}];
  c.getSchedules_ = () => { assert.equal(held,false); return schedules; };
  c.attendanceWriteLock_ = () => ({waitLock(){held=true;},releaseLock(){held=false;}});
  c.ensureFieldReportSheet_ = c.ensureFieldReportContractHeaders_ = c.ensureFieldReportDeliveryHeaders_ = () => {};
  c.today_ = () => '2026-09-13'; c.dateKey_ = v => v; c.scheduleReportKey_ = () => 'S';
  c.rows_ = () => schedules;
  c.findSchedule_ = (_u,_d,_id,_t,rows) => { assert.equal(held,true); assert.equal(rows,schedules); return rows[0]; };
  c.fieldReportsFor_ = () => reports;
  c.Utilities = {getUuid:()=> 'F'};
  c.SpreadsheetApp = {flush(){}};
  c.appendObject_ = (_name,row) => reports.push(row);
  c.notifyManagers_ = () => assert.fail('打刻でメールを待たない');
  c.safeTimingStatus_ = () => null;
  const result=c.submitFieldReport_({email:'test@example.invalid'},{reportType:'出発',scheduleId:'S',fastSave:true},'TOKEN');
  assert.equal(result.notificationStatus,'queued');
  assert.equal(reports[0]['通知状態'],'待機');
  assert.equal(c.submitFieldReport_({email:'test@example.invalid'},{reportType:'出発',scheduleId:'S',fastSave:true},'TOKEN').duplicate,true);
  assert.equal(reports.length,1);
  assert.equal(held,false);
});

for (const fail of [false,true]) test(`通知配送はロック外、結果を残し二重配送しない（失敗=${fail}）`,()=>{
  const c=context();let held=false, sent=0;
  const row={field_report_id:'F','通知状態':'待機','報告種別':'出発','報告者メール':'test@example.invalid','報告日時':new Date()};
  c.rows_=()=>[row];
  c.attendanceWriteLock_=()=>({waitLock(){held=true;},releaseLock(){held=false;}});
  c.updateById_=(_n,_col,_id,changes)=>Object.assign(row,changes);
  c.formatJst_=()=> 'time'; c.managerEmails_=()=>[];
  c.notificationExists_=()=>false;c.createNotification_=()=>{};
  c.sendAttendanceMail_=()=>{assert.equal(held,false);sent++;if(fail)throw Error('mail');};
  c.deliverPendingFieldReports_();
  assert.equal(row['通知状態'],fail?'要確認':'送信済み');
  c.deliverPendingFieldReports_();assert.equal(sent,1);
});
