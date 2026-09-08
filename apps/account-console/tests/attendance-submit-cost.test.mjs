import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const backend = readFileSync(new URL('../backend/attendance-apps-script/Code.gs', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../js/dashboard/main.js', import.meta.url), 'utf8');

test('終了報告は最新予定を一度だけ取得し、応答の予定一覧にも再利用する', () => {
  const c = vm.createContext({ console }); vm.runInContext(backend, c);
  let fetches = 0;
  const record = { record_id:'R1', schedule_id:'S1', email:'self@example.com', '勤務日':'2026-09-09', '実開始':'07:00' };
  c.getSchedules_ = () => { fetches++; return [{ schedule_id:'S1', email:record.email, '勤務日':'2026-09-09', '開発予定ID':'CASE1' }]; };
  c.selectClockOutRecord_ = () => record;
  c.findRecord_ = () => record;
  c.dateKey_ = value => String(value);
  c.matchesUser_ = (r,u) => r.email === u.email;
  c.buildTimingStatus_ = () => ({ endApprovalRequired:false });
  c.attendanceWriteLock_ = () => ({ waitLock(){}, releaseLock(){} });
  c.updateById_ = (_s,_k,_id,changes) => Object.assign(record,changes);
  c.workReportRequiredForRecord_ = () => false;
  c.hasPendingApproval_ = () => false;
  c.findApprovalRequestId_ = () => '';
  const result = c.clockOut_({email:record.email},{scheduleId:'S1'},'token');
  assert.equal(fetches,1); assert.ok(record['実終了']); assert.equal(result.plans[0].id,'CASE1');
  fetches=0;
  assert.equal(c.clockOut_({email:record.email},{scheduleId:'S1'},'token').duplicate,true);
  assert.equal(fetches,1);
});

test('通知失敗のログは分類だけ残し、宛先やエラー内の秘密を記録しない', () => {
  const logs=[]; const c=vm.createContext({console:{warn:(...args)=>logs.push(args)}});
  vm.runInContext(backend,c);
  c.managerEmails_=()=>[]; c.createNotification_=()=>{};
  c.sendAttendanceMail_=()=>{throw new Error('Daily quota exceeded private@example.com SECRET');};
  assert.throws(()=>c.notifyManagers_({email:'private@example.com'},'test','private message'),/quota/);
  assert.match(JSON.stringify(logs),/quota/); assert.match(JSON.stringify(logs),/mail/);
  assert.doesNotMatch(JSON.stringify(logs),/private|SECRET/);
});

test('終了保存の成功を、重い再取得の完了前に表示する',async()=>{
  const fn=frontend.match(/async function submitCompletion\([^]*?\n\}/)[0];
  const events=[]; let finishLoad;
  const c=vm.createContext({dashboardData:{schedule:{schedule_id:'S1'}},openDialog:async()=>true,readReason:()=>'',
    $:()=>null,runAction:fn=>fn(),attendanceRequest:async()=>({ok:true,workReportRequired:false}),
    showAlert:()=>events.push('saved'),loadDashboard:()=>new Promise(resolve=>{events.push('reload');finishLoad=resolve;})});
  vm.runInContext(fn,c); const pending=c.submitCompletion();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,['saved','reload']); finishLoad(); await pending;
});
