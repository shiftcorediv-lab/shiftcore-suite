import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const attendance = read('../backend/attendance-apps-script/Code.gs');

test('本人確認と台帳照合を分離し、元の本人情報と判定を維持する', () => {
  let now = 0;
  const c = vm.createContext({ Date: { now: () => now } });
  vm.runInContext(read('../backend/account-apps-script/token_auth.js'), c);
  c.resolveFirebaseEmailByIdToken_ = () => { now += 120; return { ok: true, email: 'PRIVATE_EMAIL' }; };
  for (const result of [{ ok: true, user: { email: 'PRIVATE_EMAIL' } }, { ok: false, code: 'USER_STOPPED' }]) {
    c.checkLoginUserByEmail = email => { assert.equal(email, 'PRIVATE_EMAIL'); now += 230; return result; };
    const response = c.resolveCurrentUserByIdToken('PRIVATE_TOKEN');
    assert.equal(response.ok, result.ok);
    assert.equal(response.user, result.user);
    assert.equal(response.code, result.code);
    assert.deepEqual(JSON.parse(JSON.stringify(response.identityTiming)), { firebaseMs: 120, memberLookupMs: 230 });
    assert.equal(result.identityTiming, undefined);
  }
});

test('認証失敗時は台帳を読まず、元のエラーを返す', () => {
  const c = vm.createContext({ Date });
  vm.runInContext(read('../backend/account-apps-script/token_auth.js'), c);
  const error = { ok: false, code: 'TOKEN_EXPIRED' };
  c.resolveFirebaseEmailByIdToken_ = () => error;
  c.checkLoginUserByEmail = () => assert.fail('認証失敗後に台帳を読まない');
  assert.equal(c.resolveCurrentUserByIdToken('TEST'), error);
});

test('勤怠は安全な時間だけを転送し、本人キャッシュに診断を保存しない', () => {
  let stored;
  const c = vm.createContext({ Date, console });
  vm.runInContext(attendance, c);
  c.dashboardScheduleSyncCache_ = () => ({ get: () => stored, put: (_key, value) => { stored = value; } });
  c.dashboardReadAuthCacheKey_ = () => 'test';
  c.resolveAttendanceIdentity_ = () => ({ ok: true, user: { email: 'PRIVATE_EMAIL' }, identityTiming: {
    firebaseMs: 12, memberLookupMs: 34, token: 'PRIVATE_TOKEN', extra: 'PRIVATE_EMAIL'
  } });
  const first = {};
  c.resolveUser_('TEST', { allowReadCache: true, timing: first });
  assert.equal(first.cache, 'miss');
  assert.equal(first.firebaseMs, 12);
  assert.equal(first.memberLookupMs, 34);
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE/);
  assert.doesNotMatch(stored, /Timing|firebaseMs|memberLookupMs/);
  c.resolveAttendanceIdentity_ = () => assert.fail('キャッシュ利用時に再照合しない');
  const second = {};
  c.resolveUser_('TEST', { allowReadCache: true, timing: second });
  assert.deepEqual(second, { cache: 'hit' });
});

test('古い応答・不正な計測値でも本人確認を妨げない', () => {
  const c = vm.createContext({ Date, console });
  vm.runInContext(attendance, c);
  for (const identityTiming of [undefined, { firebaseMs: 'PRIVATE', memberLookupMs: -1 }, { firebaseMs: NaN, memberLookupMs: Infinity }]) {
    c.resolveAttendanceIdentity_ = () => ({ user: { email: 'test@example.com' }, identityTiming });
    const timing = {};
    assert.equal(c.resolveUser_('TEST', { timing }).email, 'test@example.com');
    assert.equal(timing.cache, 'disabled');
    assert.equal(timing.firebaseMs, undefined);
    assert.equal(timing.memberLookupMs, undefined);
  }
});

test('画面の診断は固定項目だけを表示し、古い内訳を消す', () => {
  const fn = read('../js/dashboard/main.js').match(/function rememberServerTiming\([^]*?\n\}/)[0];
  const element = { dataset: {} };
  const c = vm.createContext({ $: () => element });
  vm.runInContext(fn, c);
  c.rememberServerTiming('dashboard', { totalMs: 100, identity: { cache: 'miss', roundTripMs: 90, firebaseMs: 20, memberLookupMs: 30, token: 'PRIVATE' } });
  assert.equal(element.dataset.dashboardIdentityFirebaseMs, '20');
  assert.equal(element.dataset.dashboardIdentityMemberLookupMs, '30');
  assert.doesNotMatch(JSON.stringify(element), /PRIVATE/);
  c.rememberServerTiming('dashboard', { totalMs: 5, identity: { cache: 'hit' } });
  assert.equal(element.dataset.dashboardIdentityCache, 'hit');
  assert.equal(element.dataset.dashboardIdentityRoundTripMs, undefined);
  assert.equal(element.dataset.dashboardIdentityFirebaseMs, undefined);
  assert.equal(element.dataset.dashboardIdentityMemberLookupMs, undefined);
  c.rememberServerTiming('dashboard', { totalMs: 5 });
  assert.equal(element.dataset.dashboardIdentityCache, undefined);
});

test('通常のダッシュボード応答に今回の本人確認の計測値が届く', () => {
  const c = vm.createContext({ Date, console: { log() {} } });
  vm.runInContext(attendance, c);
  c.dashboardScheduleSyncCache_ = () => null;
  c.resolveAttendanceIdentity_ = () => ({ user: { email: 'PRIVATE_EMAIL' }, identityTiming: { firebaseMs: 12, memberLookupMs: 34 } });
  c.getDashboardData_ = () => ({ ok: true });
  c.dashboardScheduleSyncStatus_ = () => ({});
  c.jsonOutput_ = value => value;
  const response = c.doPost({ postData: { contents: JSON.stringify({ action: 'getDashboardData', idToken: 'TEST' }) } });
  assert.equal(response.ok, true);
  assert.equal(response.serverTiming.identity.firebaseMs, 12);
  assert.equal(response.serverTiming.identity.memberLookupMs, 34);
  assert.doesNotMatch(JSON.stringify(response.serverTiming), /PRIVATE_EMAIL/);
});

test('本人確認の一回の遅延と失敗後の再試行を分離して計測する', () => {
  for (const retry of [false,true]) {
    let now = 0, calls = 0;
    const c = vm.createContext({Date:{now:()=>now},console:{warn(){}},Utilities:{sleep:ms=>{now+=ms;}},UrlFetchApp:{fetch(){
      calls++;
      now += calls === 1 ? 40000 : 2000;
      if(retry && calls===1) throw new Error('PRIVATE_TOKEN');
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,user:{email:'PRIVATE_EMAIL'}})};
    }}});
    vm.runInContext(attendance,c);
    const timing={};
    assert.equal(c.resolveUser_('PRIVATE_TOKEN',{timing}).email,'PRIVATE_EMAIL');
    assert.equal(timing.attemptCount,retry?2:1);
    assert.equal(timing.firstAttemptMs,40000);
    assert.equal(timing.secondAttemptMs,retry?2000:undefined);
    assert.equal(timing.retryWaitMs,retry?500:undefined);
    assert.equal(timing.roundTripMs,retry?42500:40000);
    assert.equal(calls,retry?2:1);
    assert.doesNotMatch(JSON.stringify(timing),/PRIVATE/);
  }
});

test('再試行の表示値はキャッシュ利用時に全て消える', () => {
  const fn=read('../js/dashboard/main.js').match(/function rememberServerTiming\([^]*?\n\}/)[0];
  const element={dataset:{}};
  const c=vm.createContext({$:()=>element});vm.runInContext(fn,c);
  c.rememberServerTiming('dashboard',{totalMs:42500,identity:{cache:'miss',attemptCount:2,firstAttemptMs:40000,secondAttemptMs:2000,retryWaitMs:500}});
  assert.equal(element.dataset.dashboardIdentityAttemptCount,'2');
  assert.equal(element.dataset.dashboardIdentityFirstAttemptMs,'40000');
  c.rememberServerTiming('dashboard',{totalMs:40,identity:{cache:'hit'}});
  for(const key of ['AttemptCount','FirstAttemptMs','SecondAttemptMs','RetryWaitMs']) assert.equal(element.dataset[`dashboardIdentity${key}`],undefined);
});
