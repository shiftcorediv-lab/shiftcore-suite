import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function backend(responses) {
  let calls = 0;
  const context = vm.createContext({ console: { warn() {} }, Utilities: { sleep() {} }, UrlFetchApp: { fetch() { const data = responses[calls++]; if (data instanceof Error) throw data; return { getResponseCode: () => data.status ?? 200, getContentText: () => JSON.stringify(data.body) }; } } });
  vm.runInContext(read('../backend/attendance-apps-script/Code.gs'), context);
  return { context, calls: () => calls };
}
test('一時的な本人確認エラーだけ再試行して正常な本人情報を返す', () => {
  const {context,calls} = backend([{status:503,body:{}},{body:{ok:true,user:{email:'test@example.com'}}}]);
  assert.equal(context.resolveUser_('TEST').email, 'test@example.com');
  assert.equal(calls(),2);
});
for (const [upstream, expected] of [['TOKEN_EXPIRED','AUTH_REFRESH_REQUIRED'],['USER_STOPPED','AUTH_ACCOUNT_UNAVAILABLE'],['USER_DISABLED','AUTH_ACCOUNT_UNAVAILABLE']]) {
  test(`${upstream}は一時障害として再試行しない`, () => {
    const {context,calls} = backend([{body:{ok:false,code:upstream}}]);
    assert.throws(() => context.resolveUser_('TEST'), error => error.code === expected);
    assert.equal(calls(),1);
  });
}
test('通信失敗が続けば本人情報なしで処理を進めない', () => {
  const {context,calls} = backend([new Error('offline'),new Error('offline')]);
  assert.throws(() => context.resolveUser_('TEST'), error => error.code === 'AUTH_SERVICE_UNAVAILABLE');
  assert.equal(calls(),2);
});
async function frontend(results) {
  const tokens = []; let calls = 0;
  const context = vm.createContext({auth:{currentUser:{uid:'test',getIdToken:async force => {tokens.push(force);return 'TEST';}}},ATTENDANCE_API_URL:'https://example.com',fetch:async () => {const result=results[calls++];if(result instanceof Error)throw result;return {json:async()=>result};}});
  vm.runInContext(read('../js/dashboard/attendance-api.js').replace(/^import .*;\n/gm,'').replace('export async function','async function'),context);
  return {context,tokens,calls:()=>calls};
}
test('保存前の期限切れだけトークンを更新して一度再送する', async () => {
  const {context,tokens,calls}=await frontend([{ok:false,code:'AUTH_REFRESH_REQUIRED'},{ok:true}]);
  assert.equal((await context.attendanceRequest('submitFieldReport')).ok,true);
  assert.deepEqual(tokens,[false,true]); assert.equal(calls(),2);
});
for(const result of [{ok:false,code:'AUTH_ACCOUNT_UNAVAILABLE'},{ok:false,code:'AUTH_SERVICE_UNAVAILABLE'},new Error('network')]) {
  test(`保存済みか不明な失敗や停止では自動再送しない: ${result.code || result.message}`,async()=>{
    const {context,calls}=await frontend([result]);
    await assert.rejects(context.attendanceRequest('submitFieldReport'));assert.equal(calls(),1);
  });
}
