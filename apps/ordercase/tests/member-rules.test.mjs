import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../backend/ordercase-apps-script/' + name, import.meta.url),'utf8');
const context = vm.createContext({});
vm.runInContext(read('Service_StoresMaster.js') + read('Service_MemberRules.js'),context);
test('同じメンバーのコードと内部IDを統合し、他の人は維持する', () => {
  const current = {preferred_member_ids:'AN0001,U0002',ng_member_ids:'U0003'};
  const result = context.changeMemberRuleLists_(current,{...current,member_keys:['U0001','AN0001'],rule:'ng'});
  assert.equal(result.preferred_member_ids,'U0002'); assert.equal(result.ng_member_ids,'U0003,U0001');
});
test('指定なしで対象者だけ解除する', () => {
  const current = {preferred_member_ids:'U0001,U0002',ng_member_ids:''};
  assert.equal(context.changeMemberRuleLists_(current,{...current,member_keys:['U0001'],rule:'none'}).preferred_member_ids,'U0002');
});
test('競合・不正な対象や値は保存しない', () => {
  const current = {preferred_member_ids:'U0001',ng_member_ids:''};
  assert.throws(()=>context.changeMemberRuleLists_(current,{preferred_member_ids:'',ng_member_ids:'',member_keys:['U0001'],rule:'none'}),/再読み込み/);
  assert.throws(()=>context.changeMemberRuleLists_(current,{...current,member_keys:[],rule:'none'}),/ID/);
  assert.throws(()=>context.changeMemberRuleLists_(current,{...current,member_keys:['U0001'],rule:'block'}),/不正/);
});
test('更新APIはマスターと同じ既存編集権限を要求する', () => {
  assert.match(read('Api_Post.js'),/action === 'updateMemberAssignmentRule'[\s\S]*?requireOrderCaseEditor_\(getIdTokenFromBody_\(body\)\)/);
});
test('マスター側からの古い保存も競合として止める', () => {
  assert.throws(()=>context.assertMemberRuleBaseline_({preferred_member_ids:'U2'}, {preferred_member_ids:'U1'}),/再読み込み/);
});
test('店舗・代理店は別々の保存先で、他の列を保持し一度で保存する', () => {
  for (const scope of ['store','agency']) {
    const values = [[scope+'_id','preferred_member_ids','ng_member_ids','status','memo','updated_at'],['TARGET','AN1,U2','','active','保持するメモ','before']];
    let writes=0, released=false, usedSheet;
    context.SHEET_STORES_MASTER='stores_master'; context.SHEET_AGENCIES_MASTER='agencies_master';
    context.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){released=true;}})};
    context.SpreadsheetApp={flush(){}};
    context.getSheetForUpdate_=name=>{usedSheet=name;return {getDataRange:()=>({getValues:()=>values.map(row=>row.slice())}),getRange:()=>({setValues(rows){writes++;values[1]=rows[0];}})};};
    context.updateMemberAssignmentRule_({scope,target_id:'TARGET',member_keys:['U1','AN1'],rule:'ng',preferred_member_ids:'AN1,U2',ng_member_ids:''});
    assert.equal(usedSheet,scope==='store'?'stores_master':'agencies_master');
    assert.equal(writes,1); assert.equal(released,true); assert.equal(values[1][1],'U2'); assert.equal(values[1][2],'U1'); assert.equal(values[1][4],'保持するメモ');
    values[1][3]='archived'; writes=0; released=false;
    assert.throws(()=>context.updateMemberAssignmentRule_({scope,target_id:'TARGET'}),/アーカイブ/);
    assert.equal(writes,0); assert.equal(released,true);
  }
});
