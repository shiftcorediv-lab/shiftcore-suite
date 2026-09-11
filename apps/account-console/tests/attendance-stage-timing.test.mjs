import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../backend/attendance-apps-script/Code.gs', import.meta.url), 'utf8');
function setup() {
  const logs=[];
  let time=0;
  const c=vm.createContext({console:{log:(...args)=>logs.push(args)},Date:{now:()=>time}});
  vm.runInContext(source,c);
  vm.runInContext('attendanceDiagnosticAction_ = "submitFieldReport"',c);
  return {c,logs,tick:n=>{time+=n;}};
}
test('段階別診断は所要時間と固定分類だけを記録する',()=>{
  const {c,logs,tick}=setup();
  const result={email:'PRIVATE_EMAIL',token:'PRIVATE_TOKEN',latitude:123};
  assert.equal(c.attendanceStage_('save',()=>{tick(12);return result;}),result);
  assert.deepEqual(JSON.parse(logs[0][1]),{action:'submitFieldReport',stage:'save',durationMs:12,outcome:'completed'});
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|latitude/);
});
test('失敗時も元の例外を維持し、例外本文をログへ残さない',()=>{
  const {c,logs}=setup(); const error=new Error('PRIVATE_EMAIL PRIVATE_TOKEN');
  assert.throws(()=>c.attendanceStage_('notification',()=>{throw error;}),e=>e===error);
  assert.equal(JSON.parse(logs[0][1]).outcome,'error');
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);
});
test('ログ障害でも保存処理を一度だけ実行して結果を返す',()=>{
  const {c}=setup(); let calls=0;
  c.console.log=()=>{throw new Error('logger failed');};
  assert.equal(c.attendanceStage_('save',()=>{calls++;return 'saved';}),'saved');
  assert.equal(calls,1);
});
test('対象外操作・不正JSONで自由入力を診断に出さず、実行状態も残さない',()=>{
  const {c,logs}=setup();
  c.resolveUser_=()=>({}); c.jsonOutput_=value=>value;
  c.doPost({postData:{contents:JSON.stringify({action:'PRIVATE_INPUT'})}});
  c.doPost({postData:{contents:'bad json'}});
  assert.equal(logs.length,0);
  assert.equal(vm.runInContext('attendanceDiagnosticAction_',c),null);
});
test('本人確認失敗でも時間を記録し、API応答契約を変えない',()=>{
  const {c,logs,tick}=setup(); c.jsonOutput_=value=>value;
  c.resolveUser_=()=>{tick(50);throw Object.assign(new Error('existing message'),{code:'AUTH_REQUIRED'});};
  const result=c.doPost({postData:{contents:JSON.stringify({action:'clockOut'})}});
  assert.equal(result.ok,false); assert.equal(result.code,'AUTH_REQUIRED');
  assert.equal(JSON.parse(logs[0][1]).durationMs,50);
  assert.equal(vm.runInContext('attendanceDiagnosticAction_',c),null);
});
