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

test('キャッシュ計測は応答原本を変更せず、命中と障害を区別する',()=>{
  const entries=new Map();
  const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=> '0'})},CacheService:{getScriptCache:()=>({get:k=>entries.get(k),put:(k,v)=>entries.set(k,v)})}});
  vm.runInContext(source,c);
  const first={}, second={}, unavailable={};
  c.cachedOrderReference_('stores',()=>({stores:[]}),first);
  const result=c.cachedOrderReference_('stores',()=>{throw Error('must not read');},second);
  assert.equal(first.cache,'miss'); assert.equal(second.cache,'hit');
  assert.deepEqual(Object.keys(result),['stores']);
  c.CacheService.getScriptCache=()=>{throw Error('cache down');};
  c.cachedOrderReference_('stores',()=>({stores:[]}),unavailable);
  assert.equal(unavailable.cache,'unavailable');
});

test('店舗の計測でも権限確認が必ず先行し、拒否時はマスターを読まない',()=>{
  let now=0, reads=0, denied=false; const logs=[];
  const c=vm.createContext({Date:{now:()=>now},console:{info:line=>logs.push(line)},
    getIdTokenFromBody_:()=> 'SECRET', requireOrderCaseEditor_:()=>{now+=30;if(denied)throw Error('denied');},
    cachedOrderReference_:(_name,loader,timing)=>{timing.cache='hit';now+=5;reads++;return loader();},
    getAgenciesMasterForManagement_:()=>[], getStoresMasterForManagement_:()=>[],jsonResponse_:x=>x});
  vm.runInContext(readFileSync(new URL('../backend/ordercase-apps-script/Api_Get.js',import.meta.url),'utf8'),c);
  const result=c.handleOrderCaseRead_({action:'getStoreMasterBootstrap'});
  assert.equal(result.ok,true); assert.equal(result.serverTiming.authMs,30);
  assert.equal(result.serverTiming.dataMs,5); assert.equal(result.serverTiming.totalMs,35);
  denied=true;
  assert.equal(c.handleOrderCaseRead_({action:'getStoreMasterBootstrap'}).ok,false);
  assert.equal(reads,1); assert.equal(JSON.parse(logs[1].slice('ORDER_STORE_TIMING '.length)).phase,'auth');
  assert.ok(logs.every(line=>!line.includes('SECRET')&&!line.includes('denied')));
  denied=false; c.console.info=()=>{throw Error('log down');};
  assert.equal(c.handleOrderCaseRead_({action:'getStoreMasterBootstrap'}).ok,true);
});
