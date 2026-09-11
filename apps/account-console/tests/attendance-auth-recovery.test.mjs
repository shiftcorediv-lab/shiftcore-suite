import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function backend(responses) {
  let calls = 0;
  const context = vm.createContext({ console: { warn() {} }, Utilities: { sleep() {} }, UrlFetchApp: { fetch() { const data = responses[calls++]; if (data instanceof Error) throw data; return { getResponseCode: () => data.status ?? 200, getContentText: () => data.raw ?? JSON.stringify(data.body) }; } } });
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
for (const [response, classification] of [
  [new Error('PRIVATE_TOKEN PRIVATE_EMAIL'), 'TRANSPORT'],
  [{status:503,raw:'PRIVATE_TOKEN PRIVATE_EMAIL'}, 'HTTP_503'],
  [{raw:'<html>PRIVATE_TOKEN PRIVATE_EMAIL</html>'}, 'INVALID_JSON'],
  [{body:null}, 'INVALID_RESPONSE'],
  [{body:[]}, 'INVALID_RESPONSE'],
  [{body:{ok:false,code:'PRIVATE_TOKEN',message:'PRIVATE_EMAIL'}}, 'INVALID_RESPONSE'],
  [{body:{ok:true,user:{}}}, 'MISSING_USER_EMAIL'],
  [{body:{ok:false,code:'TOKEN_LOOKUP_FAILED'}}, 'TOKEN_LOOKUP_FAILED'],
]) {
  test(`本人確認の失敗を安全な固定分類で画面に返す: ${classification}`, () => {
    const {context,calls} = backend([response,response]);
    assert.throws(() => context.resolveUser_('PRIVATE_TOKEN'), error => {
      assert.equal(error.code,'AUTH_SERVICE_UNAVAILABLE');
      assert.ok(error.message.includes(`確認コード：${classification} → ${classification}`));
      assert.doesNotMatch(error.message,/PRIVATE_TOKEN|PRIVATE_EMAIL/);
      return true;
    });
    assert.equal(calls(),2);
  });
}
test('異なる失敗を順に残し、ログ障害でも既存の再試行を維持する', () => {
  const {context,calls} = backend([new Error('offline'),{status:502,body:{}}]);
  context.console.warn = () => { throw new Error('log unavailable'); };
  assert.throws(() => context.resolveUser_('TEST'), error =>
    error.code === 'AUTH_SERVICE_UNAVAILABLE' && error.message.includes('TRANSPORT → HTTP_502'));
  assert.equal(calls(),2);
});
async function frontend(results) {
  const tokens = []; let calls = 0;
  const context = vm.createContext({auth:{currentUser:{uid:'test',getIdToken:async force => {tokens.push(force);return 'TEST';}}},ATTENDANCE_API_URL:'https://example.com',fetch:async () => {const result=results[calls++];if(result instanceof Error)throw result;return {json:async()=>{if(result?.invalidJson)throw new SyntaxError('Unexpected token <');return result;}};}});
  Object.assign(context, { AbortController, setTimeout, clearTimeout });
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
  const {context,calls}=await frontend([new Error('Failed to fetch'),new Error('Failed to fetch')]);
  await assert.rejects(context.attendanceRequest('getDashboardData'), error =>
    error.code === 'API_NETWORK_ERROR' && !/保存|打刻/.test(error.message));
  assert.equal(calls(),2);
});

for (const action of ['getDashboardData','getMyWorkReportSummary']) {
  for (const failure of [new Error('offline'),{invalidJson:true},null,{}]) {
    test(`${action}の一時的な通信・応答不良は一度だけ再試行する: ${JSON.stringify(failure)}`, async () => {
      const {context,calls,tokens} = await frontend([failure,{ok:true}]);
      assert.equal((await context.attendanceRequest(action)).ok,true);
      assert.equal(calls(),2);
      assert.deepEqual(tokens,[false,false]);
    });
  }
}
test('読み取り応答不良が続いても二回で止まり、保存結果不明と案内しない', async () => {
  const {context,calls} = await frontend([{invalidJson:true},{invalidJson:true},{ok:true}]);
  await assert.rejects(context.attendanceRequest('getDashboardData'), e => e.code==='INVALID_API_RESPONSE' && !/保存|再送/.test(e.message));
  assert.equal(calls(),2);
});
for (const action of ['refreshDashboardData','getWorkReportForm','arrive','clockIn','clockOut','submitCorrection','submitFieldReport','submitReport']) {
  test(`${action}は読み取り再試行の対象へ広げない`, async () => {
    const {context,calls} = await frontend([{invalidJson:true},{ok:true}]);
    await assert.rejects(context.attendanceRequest(action));
    assert.equal(calls(),1);
  });
}
test('停止・権限エラーは読み取りでも再試行しない', async () => {
  const {context,calls} = await frontend([{ok:false,code:'AUTH_ACCOUNT_UNAVAILABLE'},{ok:true}]);
  await assert.rejects(context.attendanceRequest('getDashboardData'));
  assert.equal(calls(),1);
});
test('再試行時にログイン本人が変わっていたら送信しない', async () => {
  const {context,calls} = await frontend([{invalidJson:true},{ok:true}]);
  const fetch = context.fetch;
  context.fetch = async () => { const result = await fetch(); context.auth.currentUser = {uid:'different'}; return result; };
  await assert.rejects(context.attendanceRequest('getDashboardData'), /アカウントが変わりました/);
  assert.equal(calls(),1);
});

for (const phase of ['fetch', 'body']) {
  test(`読み取りの${phase}待ちが60秒を超えたら終了し、自動再送しない`, async () => {
    const {context} = await frontend([]);
    let expire, requests = 0, cleared = 0;
    context.setTimeout = (fn, ms) => { assert.equal(ms, 60000); expire = fn; return 1; };
    context.clearTimeout = () => { cleared++; };
    context.fetch = async (_url, options) => {
      requests++;
      const pending = () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true});
        expire();
      });
      return phase === 'fetch' ? pending() : {json: pending};
    };
    await assert.rejects(context.attendanceRequest('getDashboardData'), e => e.code === 'API_READ_TIMEOUT' && /再読み込み/.test(e.message));
    assert.equal(requests, 1);
    assert.equal(cleared, 1);
  });
}
test('正常な読み取りはタイマーを解除し、保存・予定同期には打ち切りを追加しない', async () => {
  const {context} = await frontend([{ok:true},{ok:true},{ok:true}]);
  let started = 0, cleared = 0;
  context.setTimeout = () => { started++; return 1; };
  context.clearTimeout = () => { cleared++; };
  await context.attendanceRequest('getMyWorkReportSummary');
  await context.attendanceRequest('submitFieldReport');
  await context.attendanceRequest('refreshDashboardData');
  assert.equal(started, 1);
  assert.equal(cleared, 1);
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
