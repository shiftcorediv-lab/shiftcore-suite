import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/ordercase-apps-script/Service_OrderCasePermissions.js',import.meta.url),'utf8');
const success={status:200,data:{ok:true,user:{status:'active',role:'developer'}}};
function setup(responses) {
  const calls=[];
  const c=vm.createContext({SHIFTCORE_ACCOUNT_API_URL:'https://example.invalid',
    UrlFetchApp:{fetch:(_url,options)=>{calls.push(JSON.parse(options.payload));const r=responses[calls.length-1];
      if(r instanceof Error)throw r;
      return {getResponseCode:()=>r.status,getContentText:()=>r.raw??JSON.stringify(r.data)};}}});
  vm.runInContext(source,c);return {c,calls};
}
for(const [name,failure] of Object.entries({transport:Error('SECRET'),html:{status:200,raw:'<html>SECRET</html>'},notFound:{status:404,raw:'HTML'},busy:{status:429,raw:'busy'},gateway:{status:502,raw:'bad gateway'},worker:{status:200,data:{ok:false,code:'WORKER_ERROR'}},missingUser:{status:200,data:{ok:true}}})) {
  test(`${name}: 本人照合のみ一度再試行`,()=>{
    const {c,calls}=setup([failure,success]);const timing={};
    assert.equal(c.fetchOrderCaseIdentity_('TOKEN',timing).user.status,'active');
    assert.equal(timing.attempts,2);assert.equal(calls.length,2);
    assert.ok(calls.every(x=>x.action==='resolveCurrentUserByIdToken'));
  });
}
for(const code of ['USER_STOPPED','USER_DISABLED','USER_NOT_FOUND','TOKEN_EXPIRED','INVALID_ID_TOKEN','PERMISSION_DENIED']) {
  test(`${code}: 明示的拒否を再試行しない`,()=>{
    const {c,calls}=setup([{status:200,data:{ok:false,code,message:'SECRET'}},success]);
    assert.throws(()=>c.fetchOrderCaseIdentity_('TOKEN'),e=>!e.message.includes('SECRET')&&/利用権限/.test(e.message));
    assert.equal(calls.length,1);
  });
}
test('401/403は再試行せず、不正応答継続は2回で停止し本文を漏らさない',()=>{
  for(const status of [401,403,200]) {
    const bad={status,raw:'<html>SECRET TOKEN</html>'};const {c,calls}=setup([bad,bad,success]);
    assert.throws(()=>c.fetchOrderCaseIdentity_('TOKEN'),e=>!e.message.includes('SECRET')&&!e.message.includes('TOKEN'));
    assert.equal(calls.length,status===200?2:1);
  }
});
test('復旧しても停止アカウントの権限確認は通さない',()=>{
  const {c}=setup([{status:502,raw:'HTML'},{status:200,data:{ok:true,user:{status:'stopped',role:'developer'}}}]);
  c.resolveOrderCaseUserByIdToken_=token=>c.fetchOrderCaseIdentity_(token).user;
  assert.throws(()=>c.requireOrderCaseUser_('TOKEN'),/停止中/);
});
