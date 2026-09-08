import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createMutationQueue, removePendingAssignment } from '../js/shiftbuilder/mutation-queue.mjs';

test('連続保存は先の応答を待ち、1件失敗しても後続を保存する', async () => {
  const enqueue = createMutationQueue(); const events = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = enqueue(async () => { events.push('first'); await gate; throw new Error('rejected'); });
  const rejected = assert.rejects(first,/rejected/);
  const second = enqueue(async () => { events.push('second'); return 'saved'; });
  const third = enqueue(async () => { events.push('third'); return 'saved'; });
  await Promise.resolve(); assert.deepEqual(events,['first']);
  release(); await rejected;
  assert.equal(await second,'saved'); assert.equal(await third,'saved');
  assert.deepEqual(events,['first','second','third']);
});

test('先の配置が失敗しても後から配置した人と保存済みの人は消さない', () => {
  const cell = { assigned: [ {assignment_id:'existing'}, {assignment_id:'pending-a',client_pending_id:'pending-a'}, {assignment_id:'saved-b',client_pending_id:'pending-b'}, {assignment_id:'pending-c',client_pending_id:'pending-c'} ] };
  removePendingAssignment(cell,'pending-a');
  assert.deepEqual(cell.assigned.map(x=>x.assignment_id),['existing','saved-b','pending-c']);
  removePendingAssignment(cell,'pending-c');
  assert.deepEqual(cell.assigned.map(x=>x.assignment_id),['existing','saved-b']);
});

test('実APIクライアントで連続した配置要求を重ねずに送信する', async () => {
  let release; const gate = new Promise(resolve => {release = resolve;});
  const sent = []; let active = 0; let maxActive = 0;
  const c = vm.createContext({ createMutationQueue, SHIFTBUILDER_API_URL:'https://example.com', window:{ShiftCoreEnvironment:{name:'staging'}}, localStorage:{getItem:()=>null}, sessionStorage:{}, fetch:async (_url, options) => {
    const body = JSON.parse(options.body); sent.push(body.internalUserId); active++; maxActive = Math.max(maxActive,active);
    if(sent.length === 1) await gate;
    active--; return {text:async()=>JSON.stringify({success:true})};
  }});
  const source = readFileSync(new URL('../js/shiftbuilder/api.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/\bexport /g,'');
  vm.runInContext(source,c);
  const first = c.createShiftBuilderAssignment('TEST',{internalUserId:'A'});
  const second = c.createShiftBuilderAssignment('TEST',{internalUserId:'B'});
  await Promise.resolve(); assert.deepEqual(sent,['A']); release();
  await Promise.all([first,second]); assert.deepEqual(sent,['A','B']); assert.equal(maxActive,1);
});

test('配置作成の失敗は全体スナップショットではなく自分の仮配置だけを戻す',()=>{
  const source = readFileSync(new URL('../js/shiftbuilder/main.js',import.meta.url),'utf8');
  const create = source.slice(source.indexOf('async function createAssignmentFromSelectedCell('),source.indexOf('async function replaceAssignmentFromSelectedCell('));
  assert.match(create,/removePendingAssignment\(found.cell, pendingAssignmentId\)/);
  assert.doesNotMatch(create,/restoreAssignedSnapshot/);
  assert.match(create,/const targetMonth = String\(workDate\).slice\(0, 7\)/);
});
