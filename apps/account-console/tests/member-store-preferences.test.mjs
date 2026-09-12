import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context = vm.createContext({normalizeText:value=>String(value ?? '').trim()});
vm.runInContext(readFileSync(new URL('../backend/account-apps-script/member_store_preferences.js', import.meta.url), 'utf8'), context);
test('本人希望の編集は有効な直属管理者だけ・開発者特例や本人編集なし', () => {
  const target = {internal_user_id:'member', direct_manager_user_id:'manager'};
  for (const [id, role, status, expected] of [['manager','member','active',true],['manager','admin','inactive',false],['member','admin','active',false],['developer','developer','active',false],['upper','admin','active',false]]) {
    assert.equal(context.canEditMemberStorePreferences_({internal_user_id:id,role,status}, target),expected);
  }
  assert.equal(context.canEditMemberStorePreferences_({internal_user_id:'manager',status:'active'},{internal_user_id:'member',direct_manager_user_id:''}),false);
});
test('本人希望は店舗IDの重複を整理し本人希望と本人NGの矛盾を拒否', () => {
  const result = context.normalizeMemberStorePreferences_({preferred:['ST2','ST1','ST1'],ng:[]});
  assert.deepEqual(Array.from(result.preferred),['ST1','ST2']);
  assert.throws(()=>context.normalizeMemberStorePreferences_({preferred:['ST1'],ng:['ST1']}),/両方/);
  assert.throws(()=>context.normalizeMemberStorePreferences_({preferred:'ST1',ng:[]}),/形式/);
});

test('保存時に直属関係・競合・実在店舗を確認し他の列は触らない', () => {
  const values = [['internal_user_id','direct_manager_user_id','member_store_preferences','memo'],['member','manager','','既存メモ']];
  const writes = [];
  let actor = 'manager';
  Object.assign(context, {
    requireAccountConsoleOperator_: () => ({internal_user_id:actor,status:'active'}),
    getUsersSheet: () => ({getDataRange:()=>({getValues:()=>values}),getRange:(r,c)=>({setValue:value=>{writes.push([r,c]);values[r-1][c-1]=value;}})}),
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    SpreadsheetApp:{flush(){}},
    memberStoreCatalog_:()=>[{id:'ST1',status:'active'}],
  });
  const body = {action:'accountConsoleSaveMemberStorePreferences',target_user_id:'member',baseline:'',preferences:{preferred:['ST1'],ng:[]}};
  actor='member'; assert.throws(()=>context.accountConsoleMemberStorePreferences(body),/直属管理者/);
  actor='manager'; const result=context.accountConsoleMemberStorePreferences(body);
  assert.equal(result.ok,true); assert.deepEqual(writes,[[2,3]]); assert.equal(values[1][3],'既存メモ');
  assert.throws(()=>context.accountConsoleMemberStorePreferences(body),/別の画面/);
  values[1][1]='new-manager';
  assert.throws(()=>context.accountConsoleMemberStorePreferences({...body,baseline:result.baseline}),/直属管理者/);
});
