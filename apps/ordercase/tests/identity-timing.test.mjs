import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../backend/ordercase-apps-script/Service_OrderCasePermissions.js',import.meta.url),'utf8');
function setup(identityTiming) {
  let now=0, fetches=0;
  const user={status:'active',role:'developer'};
  const c=vm.createContext({Date:{now:()=>now},
    CacheService:{getScriptCache:()=>({get:()=>JSON.stringify(user),put:()=>{throw Error('must not cache');}})},
    Utilities:{base64EncodeWebSafe:()=> 'hash',computeDigest:()=>[],DigestAlgorithm:{SHA_256:'sha256'}},
    SHIFTCORE_ACCOUNT_API_URL:'https://example.invalid',ORDERCASE_PERMISSION_ALL:'all',
    ORDERCASE_PERMISSION_EDIT:'edit',ORDERCASE_PERMISSION_VIEW:'view',ORDERCASE_PERMISSION_VIEW_WITHOUT_AMOUNT:'no-amount',
    UrlFetchApp:{fetch:()=>{fetches++;now+=100;return {getContentText:()=>JSON.stringify({ok:true,user,identityTiming})};}}});
  vm.runInContext(source,c);
  return {c,getFetches:()=>fetches};
}
test('編集権限はキャッシュを迂回し同一照合の数値だけを計測する',()=>{
  const {c,getFetches}=setup({firebaseMs:10,memberLookupMs:20,email:'PRIVATE',token:'SECRET'});
  const timing={};
  const result=c.requireOrderCaseEditor_('SECRET',timing);
  assert.equal(result.canEdit,true);assert.equal(getFetches(),1);
  assert.deepEqual(timing,{cache:'disabled',roundTripMs:100,firebaseMs:10,memberLookupMs:20});
});
test('上流に計測がない場合や不正な数値でも本人照合を壊さない',()=>{
  for(const input of [undefined,{firebaseMs:-1,memberLookupMs:'20'},{firebaseMs:null,memberLookupMs:null}]) {
    const {c}=setup(input);const timing={};
    assert.equal(c.requireOrderCaseEditor_('SECRET',timing).canEdit,true);
    assert.deepEqual(timing,{cache:'disabled',roundTripMs:100});
  }
});
test('計測なしの既存呼出しと読取キャッシュを維持する',()=>{
  const {c,getFetches}=setup({firebaseMs:10});
  assert.equal(c.requireOrderCaseEditor_('SECRET').canEdit,true);
  const timing={};
  assert.equal(c.resolveOrderCaseUserByIdToken_('SECRET',{timing}).status,'active');
  assert.deepEqual(timing,{cache:'hit'});assert.equal(getFetches(),1);
});
