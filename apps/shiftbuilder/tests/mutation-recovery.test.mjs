import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createMutationQueue } from '../js/shiftbuilder/mutation-queue.mjs';
import { runRecoverableMutation, sendWithBusyRetry } from '../js/shiftbuilder/mutation-recovery.mjs';
import { requiresAuthRefresh } from '../js/shiftbuilder/auth-refresh-policy.js';
const noWait = async () => {};

test('10件連続で応答切断とロック競合があっても順番を守り、二重作成しない', async () => {
  const enqueue = createMutationQueue();
  const saved = []; const attempts = new Map(); let active = 0; let maxActive = 0;
  const jobs = Array.from({length:10}, (_,i) => enqueue(async () => {
    active++; maxActive = Math.max(maxActive,active);
    try {
      return await runRecoverableMutation('shiftBuilderCreateAssignment',{internalUserId:String(i)},async action => {
        if (action === 'shiftBuilderCheckAssignment') return {success:true,assignment:{assignment_id:`A${i}`}};
        const count = (attempts.get(i) || 0) + 1; attempts.set(i,count);
        if (i === 8 && count === 1) return {success:false,code:'SHIFT_WRITE_BUSY'};
        saved.push(i);
        if (i === 7) throw new TypeError('Failed to fetch');
        return {success:true,assignment:{assignment_id:`A${i}`}};
      }, noWait);
    } finally { active--; }
  }));
  const results = await Promise.all(jobs);
  assert.equal(results.every(r=>r.success),true);
  assert.deepEqual(saved,Array.from({length:10},(_,i)=>i));
  assert.equal(maxActive,1); assert.equal(attempts.get(7),1); assert.equal(attempts.get(8),2);
});

test('照合不能は保存失敗と断定せず、作成を再送しない',async()=>{
  const actions=[];
  await assert.rejects(runRecoverableMutation('shiftBuilderCreateAssignment',{},async action=>{
    actions.push(action);
    if(action==='shiftBuilderCreateAssignment') throw new TypeError('Failed to fetch');
    return {success:true,assignment:null};
  },noWait), {code:'MUTATION_RESULT_UNKNOWN'});
  assert.deepEqual(actions,['shiftBuilderCreateAssignment','shiftBuilderCheckAssignment']);
});

test('入力・権限拒否は再送せず、ロック再試行も4回で終える',async()=>{
  let count=0;
  await sendWithBusyRetry(async()=>{count++;return {success:false,code:'FORBIDDEN'};},noWait);
  assert.equal(count,1);count=0;
  const result=await sendWithBusyRetry(async()=>{count++;return {success:false,code:'SHIFT_WRITE_BUSY'};},noWait);
  assert.equal(count,4);assert.equal(result.code,'SHIFT_WRITE_BUSY');
});

test('ロック待ちを認証切れと誤表示しない',()=>{
  assert.equal(requiresAuthRefresh('ロックのタイムアウト: 別のプロセスがロックを保持'),false);
  assert.equal(requiresAuthRefresh('認証確認がタイムアウトしました'),true);
});

test('保存結果照合は権限確認とロックの後に読み、書き込まない',()=>{
  const events=[];
  const c=vm.createContext({
    requireShiftBuilderEditorOperator_:()=>events.push('auth'),
    LockService:{getScriptLock:()=>({tryLock:()=>{events.push('lock');return true;},releaseLock:()=>events.push('release')})},
    getActiveShiftAssignments_:()=>{events.push('read');return [{case_id:'C',work_date:'2026-09-14',internal_user_id:'U',assignment_id:'A'}];},
    normalizeText:v=>String(v||''),normalizeDateString:v=>String(v||''),ok_:data=>({success:true,...data})
  });
  vm.runInContext(readFileSync(new URL('../backend/shiftbuilder-apps-script/ShiftBuilderService.js',import.meta.url),'utf8'),c);
  c.requireShiftBuilderEditorOperator_=()=>events.push('auth');
  c.getActiveShiftAssignments_=()=>{events.push('read');return [{case_id:'C',work_date:'2026-09-14',internal_user_id:'U',assignment_id:'A'}];};
  assert.equal(c.shiftBuilderCheckAssignment({caseId:'C',workDate:'2026-09-14',internalUserId:'U'}).assignment.assignment_id,'A');
  assert.deepEqual(events,['auth','lock','read','release']);
  events.length=0;
  c.LockService={getScriptLock:()=>({tryLock:()=>false})};
  c.ng_=(message,code)=>({success:false,message,code});
  assert.equal(c.shiftBuilderCheckAssignment({}).code,'SHIFT_WRITE_BUSY');
  assert.deepEqual(events,['auth']);
  events.length=0;
  assert.equal(c.shiftBuilderCreateAssignment({}).code,'SHIFT_WRITE_BUSY');
  assert.deepEqual(events,['auth']);
});
