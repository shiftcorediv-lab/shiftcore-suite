import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const body = name => source.match(new RegExp('function ' + name + '\\([^)]*\\) \\{([\\s\\S]*?)\\n    \\}'))[1];
test('店舗を先に入力し、金額区分と税区分に新規登録の初期値がある', () => {
  assert.ok(source.indexOf('id="storeName"') < source.indexOf('id="agencyName"'));
  assert.match(source, /value="per_person_day" selected/);
  assert.match(source, /value="tax_included" selected/);
  assert.doesNotMatch(body('renderStoreSuggestions'), /stores\.filter\(row => \{\s*return agencyId/);
});
test('店舗の既知項目だけ非表示にし、別店舗へ変えたら前店舗の値を解除する', () => {
  const fields = Object.fromEntries(['storeName','agencyName','storeShortName','storeAddress','storeNearestStation'].map(id => [id,{value:'',parentElement:{classList:{toggle(_,hidden){fields[id].hidden=hidden;}}}}]));
  const row = {store_name:'梅田',agency_name:'代理店A',store_short_name:'梅田店',address:'大阪',nearest_station:''};
  fields.storeName.value='梅田'; fields.agencyName.value='代理店A';
  const state={storesMaster:[row]};
  const context={document:{getElementById:id=>fields[id]},state,normalizeText:value=>String(value||'').trim(),selected:undefined};
  vm.runInNewContext('(function(){'+body('updateStoreMasterFields')+'})()',context);
  assert.equal(fields.storeAddress.value,'大阪'); assert.equal(fields.storeAddress.hidden,true);
  assert.equal(fields.storeNearestStation.hidden,false);
  fields.storeName.value='別店舗';
  vm.runInNewContext('(function(){'+body('updateStoreMasterFields')+'})()',context);
  assert.equal(fields.storeAddress.value,''); assert.equal(fields.storeAddress.hidden,false);
});
test('店頭・軒先は共通時間を日付／日数カードへ移し他種別は稼働条件へ戻す', () => {
  for (const type of ['retail_store','roadside','event']) for (const mode of ['dates','days']) {
    const moved=[]; const home={appendChild:el=>moved.push(['home',el.id])};
    const section={classList:{toggle(_,value){section.hidden=value;}},querySelector:()=>home};
    const fields={caseType:{value:type},inputMode:{value:mode},workConditionSection:section};
    for (const id of ['datesCommonTime','daysCommonTime']) fields[id]={appendChild:el=>moved.push([id,el.id])};
    for (const id of ['workStartTimeWrap','workEndTimeWrap']) fields[id]={id,classList:{remove(){}}};
    vm.runInNewContext(body('updateCommonWorkTimeView'),{document:{getElementById:id=>fields[id]}});
    const compact=type!=='event';
    assert.equal(section.hidden,compact);
    assert.deepEqual(moved.map(item=>item[0]),Array(2).fill(compact?mode+'CommonTime':'home'));
  }
});
