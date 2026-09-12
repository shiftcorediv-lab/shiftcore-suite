import test from 'node:test';
import assert from 'node:assert/strict';
import {renderShiftTable} from '../js/shiftbuilder/render-shift-table.js';
import {renderPersonnelTable, renderDailySummaryRows} from '../js/shiftbuilder/render-personnel-table.js';
import {getCaseMemberPreference} from '../js/shiftbuilder/assignment-preference-policy.mjs';
const element = () => ({innerHTML:'',querySelectorAll:()=>[]});

test('日別3行は両軸の日付見出し直上・tbodyには重複させない', () => {
  const dailySummary = [{date:'2026-10-01',submitted:3,required:2,balance:1}];
  const dates = [{date:'2026-10-01',weekday:'木'}];
  for (const axis of ['case','personnel']) {
    const elements = {shiftTableHead:element(),shiftTableBody:element()};
    if (axis==='case') renderShiftTable({dates,cases:[]},elements,{dailySummary});
    else renderPersonnelTable({dates,people:[],dailySummary},elements);
    const head = elements.shiftTableHead.innerHTML;
    assert.equal((head.match(/class="personnel-daily-summary"/g)||[]).length,3);
    assert.ok(head.indexOf('過不足数') < head.indexOf('2026-10-01'));
    assert.doesNotMatch(elements.shiftTableBody.innerHTML,/personnel-daily-summary/);
    assert.match(head,/>\+1</);
  }
  assert.equal(renderDailySummaryRows({dailySummary:[]}), '');
});

test('日数指定充足後は配置名を保ち、残りは灰色の横棒・解除後は未配置に戻る', t => {
  const previousWindow = globalThis.window;
  globalThis.window = {ShiftCoreEnvironment:{withEnvironment:url=>url}};
  t.after(()=>{globalThis.window=previousWindow;});
  const date1='2026-10-01',date2='2026-10-02';
  const data={dates:[{date:date1,weekday:'木'},{date:date2,weekday:'金'}],cases:[{
    caseId:'TEST',title:'テスト',input_mode:'days',requested_days:1,
    cells:{[date1]:{required:1,assigned:[{internal_user_id:'U1',display_name:'表示名'}]},[date2]:{required:1,assigned:[]}}
  }]};
  const elements={shiftTableHead:element(),shiftTableBody:element()};
  renderShiftTable(data,elements);
  assert.match(elements.shiftTableBody.innerHTML,/case-fulfillment-badge-fulfilled/);
  assert.match(elements.shiftTableBody.innerHTML,/充足済み・追加配置不要/);
  assert.match(elements.shiftTableBody.innerHTML,/表示名/);
  assert.match(elements.shiftTableBody.innerHTML,/>\s*—\s*</);
  data.cases[0].cells[date1].assigned=[];
  renderShiftTable(data,elements);
  assert.doesNotMatch(elements.shiftTableBody.innerHTML,/充足済み・追加配置不要/);
  assert.match(elements.shiftTableBody.innerHTML,/未配置/);
});

test('代理店・店舗・本人の希望は競合しても出所をすべて残す・店舗IDで照合', () => {
  const candidate={internal_user_id:'U1',member_store_preferences:JSON.stringify({preferred:[],ng:['ST1']})};
  const record={store_id:'ST1',store_preferred_member_ids:['U1'],agency_ng_member_ids:['U1']};
  assert.deepEqual(getCaseMemberPreference(record,candidate).badgeLabels,['店舗指名','代理店NG','本人NG']);
  assert.equal(getCaseMemberPreference({...record,store_id:'ST2'},candidate).isPersonalNg,false);
  candidate.member_store_preferences=JSON.stringify({preferred:['ST1'],ng:[]});
  assert.equal(getCaseMemberPreference(record,candidate).isPersonalPreferred,true);
  candidate.member_store_preferences='null';
  assert.equal(getCaseMemberPreference(record,candidate).isPersonalNg,false);
});
