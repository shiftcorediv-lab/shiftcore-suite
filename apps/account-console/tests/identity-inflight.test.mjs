import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/login/api.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace('export async function','async function');
test('同じ本人の同時照合だけを共有し、完了後・別本人では再取得する',async()=>{
  const pending=[];const c=vm.createContext({LOGIN_CHECK_URL:'https://example.invalid',AbortController,setTimeout,clearTimeout,fetch:()=>new Promise(resolve=>pending.push(resolve))});
  vm.runInContext(source,c);
  const first=c.resolveCurrentUserWithGasByIdToken('A'),second=c.resolveCurrentUserWithGasByIdToken('A'),other=c.resolveCurrentUserWithGasByIdToken('B');
  assert.equal(pending.length,2);
  pending[0]({json:async()=>({ok:true})});pending[1]({json:async()=>({ok:true})});
  await Promise.all([first,second,other]);
  const next=c.resolveCurrentUserWithGasByIdToken('A');assert.equal(pending.length,3);
  pending[2]({json:async()=>({ok:true})});await next;
});
test('本人照合失敗を残さず、次の明示的な取得が可能',async()=>{
  let calls=0;const c=vm.createContext({LOGIN_CHECK_URL:'https://example.invalid',AbortController,setTimeout,clearTimeout,fetch:async()=>{calls++;throw Error('offline');}});
  vm.runInContext(source,c);
  for(let i=0;i<2;i++)await assert.rejects(c.resolveCurrentUserWithGasByIdToken('A'),/offline/);
  assert.equal(calls,2);
});
