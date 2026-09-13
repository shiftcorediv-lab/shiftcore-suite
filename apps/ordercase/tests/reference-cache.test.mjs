import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/ordercase-apps-script/Service_Bootstrap.js',import.meta.url),'utf8');
test('マスターは30分保存、更新世代変更後は別端末の取得も最新になる',()=>{
  let version='0',reads=0;const entries=new Map();
  const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>version,setProperty:(_k,v)=>version=v})},Utilities:{getUuid:()=> 'new'},CacheService:{getScriptCache:()=>({get:k=>entries.get(k),put(k,v,ttl){assert.equal(ttl,1800);entries.set(k,v);}})}});
  vm.runInContext(source,c);
  const load=()=>({count:++reads});
  assert.equal(c.cachedOrderReference_('stores',load).count,1);
  assert.equal(c.cachedOrderReference_('stores',load).count,1);
  c.invalidateOrderReferences_();
  assert.equal(c.cachedOrderReference_('stores',load).count,2);
});
test('キャッシュ障害では原本を読み、原本取得失敗は再送・空成功に変えない',()=>{
  let reads=0;const c=vm.createContext({PropertiesService:{getScriptProperties(){throw Error('unavailable');}}});
  vm.runInContext(source,c);
  assert.equal(c.cachedOrderReference_('stores',()=>++reads),1);
  assert.throws(()=>c.cachedOrderReference_('stores',()=>{reads++;throw Error('source failed');}),/source failed/);
  assert.equal(reads,2);
});
