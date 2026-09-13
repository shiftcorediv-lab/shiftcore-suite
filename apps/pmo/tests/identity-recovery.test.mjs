import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/pmo-apps-script/auth_guard.gs.js',import.meta.url),'utf8');
function setup(results) {
  let calls=0;
  const context=vm.createContext({normalizeText:v=>String(v||'').trim(),SETTINGS:{SHIFTCORE_LOGIN_API_URL:'https://example.invalid'},UrlFetchApp:{fetch(_url,options){
    assert.equal(JSON.parse(options.payload).action,'resolveCurrentUserByIdToken');
    const item=results[calls++];if(item instanceof Error)throw item;
    return {getResponseCode:()=>item.status??200,getContentText:()=>item.raw??JSON.stringify(item.data)};
  }}});
  vm.runInContext(source,context);
  return {context,calls:()=>calls};
}
const success={data:{ok:true,user:{internal_user_id:'TEST',name:'テスト',employee_code:'AN0001',status:'active',work_status:'on',role:'staff'}}};
for(const failure of [new Error('transport'),{status:404,raw:'<html>not found</html>'},{status:502,raw:'bad gateway'},{raw:'invalid'},{data:{ok:false,code:'WORKER_ERROR'}},{data:null}]) {
  test(`本人確認の一時障害だけ一度再試行: ${JSON.stringify(failure)}`,()=>{
    const {context,calls}=setup([failure,success]);
    assert.equal(context.getPmoCurrentUserSecure('token').success,true);assert.equal(calls(),2);
  });
}
for(const code of ['USER_STOPPED','USER_DISABLED','USER_NOT_FOUND','TOKEN_EXPIRED','INVALID_ID_TOKEN','PERMISSION_DENIED']) {
  test(`${code}は再試行しない`,()=>{
    const {context,calls}=setup([{data:{ok:false,code}},success]);
    assert.equal(context.getPmoCurrentUserSecure('token').code,code);assert.equal(calls(),1);
  });
}
test('障害が続いても2回で終了し、未認証のまま進まない',()=>{
  const {context,calls}=setup([new Error('SECRET'),{raw:'SECRET'}]);
  const result=context.getPmoCurrentUserSecure('token');
  assert.equal(result.success,false);assert.equal(result.code,'AUTH_SERVICE_UNAVAILABLE');assert.equal(calls(),2);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|token/);
});
test('HTTP403とトークン未指定は再試行しない',()=>{
  const {context,calls}=setup([{status:403,raw:'denied'}]);
  assert.equal(context.getPmoCurrentUserSecure('').success,false);assert.equal(calls(),0);
  assert.equal(context.getPmoCurrentUserSecure('token').success,false);assert.equal(calls(),1);
});
test('照合後も非稼働者は提出不可',()=>{
  const {context,calls}=setup([{data:{...success.data,user:{...success.data.user,work_status:'off'}}}]);
  assert.equal(context.getPmoCurrentUserSecure('token').code,'PMO_USER_INACTIVE');assert.equal(calls(),1);
});
