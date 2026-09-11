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
  const context = vm.createContext({auth:{currentUser:{uid:'test',getIdToken:async force => {tokens.push(force);return 'TEST';}}},ATTENDANCE_API_URL:'https://example.com',fetch:async () => {const result=results[calls++];if(result instanceof Error)throw result;return {json:async()=>{if(result?.invalidJson)throw new SyntaxError('Unexpected token <');return result;}};}});
  vm.runInContext(read('../js/dashboard/attendance-api.js').replace(/^import .*;\n/gm,'').replace('export async function','async function'),context);
  return {context,tokens,calls:()=>calls};
}
test('保存前の期限切れだけトークンを更新して一度再送する', async () => {
  const {context,tokens,calls}=await frontend([{ok:false,code:'AUTH_REFRESH_REQUIRED'},{ok:true}]);
  assert.equal((await context.attendanceRequest('submitFieldReport')).ok,true);
  assert.deepEqual(tokens,[false,true]); assert.equal(calls(),2);
});
for (const result of [{invalidJson:true}, null, {}, 'html']) {
  test(`不正応答を日本語で案内し、保存操作を自動再送しない: ${JSON.stringify(result)}`, async () => {
    const {context,calls} = await frontend([result]);
    await assert.rejects(context.attendanceRequest('submitFieldReport'), error => error.code === 'INVALID_API_RESPONSE' && /再送せず/.test(error.message));
    assert.equal(calls(), 1);
  });
}
for(const result of [{ok:false,code:'AUTH_ACCOUNT_UNAVAILABLE'},{ok:false,code:'AUTH_SERVICE_UNAVAILABLE'},new Error('network')]) {
  test(`保存済みか不明な失敗や停止では自動再送しない: ${result.code || result.message}`,async()=>{
    const {context,calls}=await frontend([result]);
    await assert.rejects(context.attendanceRequest('submitFieldReport'));assert.equal(calls(),1);
  });
}

test('送信後の通信切断は保存失敗と断定せず、自動再送しない', async () => {
  const {context,calls}=await frontend([new Error('Failed to fetch')]);
  await assert.rejects(context.attendanceRequest('submitFieldReport'), error =>
    error.code === 'SAVE_RESULT_UNKNOWN' && /保存済みの可能性/.test(error.message) && /再送せず/.test(error.message));
  assert.equal(calls(),1);
});

test('読み込みの通信切断を打刻失敗として扱わない', async () => {
  const {context,calls}=await frontend([new Error('Failed to fetch')]);
  await assert.rejects(context.attendanceRequest('getDashboardData'), error =>
    error.code === 'API_NETWORK_ERROR' && !/保存|打刻/.test(error.message));
  assert.equal(calls(),1);
});

test('保存結果不明の画面は再打刻を止め、失敗と断定しない', async () => {
  const source=read('../js/dashboard/main.js');
  const fn=source.match(/async function runAction\([^]*?\n\}/)[0];
  for (const code of ['SAVE_RESULT_UNKNOWN','INVALID_API_RESPONSE']) {
    const alerts=[]; let unavailable=false;
    const context=vm.createContext({busy:false,document:{body:{classList:{add(){},remove(){}}}},
      showStatus(){},showAlert:(message,kind)=>alerts.push({message,kind}),renderUnavailable:()=>{unavailable=true;}});
    vm.runInContext(fn,context);
    const error=Object.assign(new Error('保存結果が不明です。再送せず確認してください。'),{code});
    await context.runAction(async()=>{throw error;});
    assert.equal(unavailable,true);
    assert.equal(alerts[0].kind,'warning');
    assert.doesNotMatch(alerts[0].message,/記録できませんでした/);
    assert.equal(context.busy,false);
  }
});
