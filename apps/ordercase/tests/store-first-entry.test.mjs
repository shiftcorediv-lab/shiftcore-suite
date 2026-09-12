import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const body = name => source.match(new RegExp('function ' + name + '\\([^)]*\\) \\{([\\s\\S]*?)\\n    \\}'))[1];
test('代理店を先に入力し、金額区分と税区分に新規登録の初期値がある', () => {
  assert.ok(source.indexOf('id="agencyName"') < source.indexOf('id="storeName"'));
  assert.match(source, /value="per_person_day" selected/);
  assert.match(source, /value="tax_excluded" selected/);
  assert.match(body('clearFormAfterSubmit'), /tax_excluded/);
  assert.match(body('renderStoreSuggestions'), /normalizeText\(row.agency_name\) === normalizeText\(agencyName\)/);
});
test('未登録店舗だけ補足4項目を表示し、空欄・登録済みでは非表示にする', () => {
  const fields = Object.fromEntries(['storeName','agencyName','storeArea','storeShortName','storeAddress','storeNearestStation'].map(id => [id,{value:'',parentElement:{classList:{toggle(_,hidden){fields[id].hidden=hidden;}}}}]));
  const row = {store_name:'梅田',agency_name:'代理店A',store_area:'関西',store_short_name:'梅田店',address:'大阪',nearest_station:''};
  fields.storeName.value='梅田'; fields.agencyName.value='代理店A';
  const state={storesMaster:[row]};
  const context={document:{getElementById:id=>fields[id]},state,normalizeText:value=>String(value||'').trim(),selected:undefined};
  vm.runInNewContext('(function(){'+body('updateStoreMasterFields')+'})()',context);
  assert.equal(fields.storeAddress.value,'大阪'); assert.equal(fields.storeAddress.hidden,true);
  assert.equal(fields.storeNearestStation.hidden,true);
  assert.equal(fields.storeArea.hidden,true);
  fields.storeName.value='別店舗';
  vm.runInNewContext('(function(){'+body('updateStoreMasterFields')+'})()',context);
  assert.equal(fields.storeAddress.value,''); assert.equal(fields.storeAddress.hidden,false);
  for (const id of ['storeArea','storeShortName','storeAddress','storeNearestStation']) assert.equal(fields[id].hidden,false);
  fields.storeAddress.value='新住所';
  vm.runInNewContext('(function(){'+body('updateStoreMasterFields')+'})()',context);
  assert.equal(fields.storeAddress.value,'新住所');
  fields.storeName.value='';
  vm.runInNewContext('(function(){'+body('updateStoreMasterFields')+'})()',context);
  for (const id of ['storeArea','storeShortName','storeAddress','storeNearestStation']) assert.equal(fields[id].hidden,true);
  fields.storeName.value='梅田';
  fields.agencyName.value='別代理店';
  vm.runInNewContext('(function(){'+body('updateStoreMasterFields')+'})()',context);
  assert.equal(fields.storeAddress.hidden,false);
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
