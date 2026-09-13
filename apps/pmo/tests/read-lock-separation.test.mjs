import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/pmo-apps-script/api.js',import.meta.url),'utf8');
for(const action of ['getPmoCurrentUserSecure','getPmoAdminMetaSecure','getPmoMonthlyTableSecure','exportMonthlyExcelSecure']) test(`${action} は保存ロックを待たない`,()=>{
  const c=vm.createContext({normalizeText:v=>String(v||''),LockService:{getScriptLock:()=>assert.fail('参照でロックを取らない')},ContentService:{MimeType:{JSON:'json'},createTextOutput:v=>({setMimeType:()=>JSON.parse(v)})},[action]:()=>({success:true})});
  vm.runInContext(source,c);
  assert.equal(c.doPost({postData:{contents:JSON.stringify({action,idToken:'test'})}}).success,true);
  assert.equal(vm.runInContext('pmoReadOnlyRequest_',c),false);
});
test('反映復旧を伴う本人の最新希望休取得はロックを維持する',()=>{
  let held=false;
  const c=vm.createContext({normalizeText:v=>String(v||''),LockService:{getScriptLock:()=>({waitLock(){held=true;},releaseLock(){held=false;}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:v=>({setMimeType:()=>JSON.parse(v)})},getLatestShiftRequestSecure:()=>{assert.equal(held,true);return {success:true};}});
  vm.runInContext(source,c);
  assert.equal(c.doPost({postData:{contents:JSON.stringify({action:'getLatestShiftRequestSecure'})}}).success,true);
  assert.equal(held,false);
});
