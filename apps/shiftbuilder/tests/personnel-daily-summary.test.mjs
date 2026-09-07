import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonnelDailySummary} from '../js/shiftbuilder/personnel-daily-summary.mjs';
import {buildPersonnelAxisViewModel} from '../js/shiftbuilder/personnel-axis-view-model.js';
const dates = [{date:'2026-10-01'}, {date:'2026-10-02'}];
test('提出済みのみ希望休を除外して人数を計上し、複数人案件の必要人数を引く', () => {
  const people = [{pmoSubmitted:true,requestedOffDates:['2026-10-02']},{pmoSubmitted:true,requestedOffDates:[]},{pmoSubmitted:false,requestedOffDates:[]}];
  const cases = [{cells:{'2026-10-01':{required:3},'2026-10-02':{required:0}}}];
  const rows = buildPersonnelDailySummary(dates,cases,people);
  assert.equal(rows[0].submitted,2); assert.equal(rows[0].required,3); assert.equal(rows[0].balance,-1);
  assert.equal(rows[1].submitted,1); assert.equal(rows[1].balance,1);
});
test('旧APIで提出状況が判別できない場合は0とせず未確認', () => {
  const rows = buildPersonnelDailySummary(dates,[],[{requestedOffDates:[]}]);
  assert.equal(rows[0].submitted,null); assert.equal(rows[0].balance,null);
});
test('日数指定の未配置分を全日へ重複計上しない', () => {
  const cases = [{input_mode:'days',requested_days:2,cells:{'2026-10-01':{required:1,assigned:[{}]},'2026-10-02':{required:1,assigned:[]}}}];
  const rows = buildPersonnelDailySummary(dates,cases,[]);
  assert.equal(rows[0].required,1); assert.equal(rows[1].required,0);
  assert.equal(rows[0].undated,true); assert.equal(rows[0].balance,null);
  cases[0].requested_days=1;
  assert.equal(buildPersonnelDailySummary(dates,cases,[])[0].balance,-1);
});
test('空の月は0、負の必要人数は0に補正', () => {
  assert.equal(buildPersonnelDailySummary(dates,[],[])[0].balance,0);
  assert.equal(buildPersonnelDailySummary(dates,[{cells:{'2026-10-01':{required:-1}}}],[])[0].required,0);
});
test('名簿と配置に同じ人がいても重複せず、提出状態を保持する', () => {
  const model = buildPersonnelAxisViewModel({dates,cases:[{caseId:'CASE1',cells:{'2026-10-01':{required:1,assigned:[{internal_user_id:'U1'}]}}}]},[
    {internal_user_id:'U1',pmo_submitted:true,requested_off_dates:['2026-10-02']},
    {internal_user_id:'U2',pmo_submitted:false,requested_off_dates:[]}
  ]);
  assert.equal(model.people.length,2); assert.equal(model.dailySummary[0].submitted,1); assert.equal(model.dailySummary[1].submitted,0);
});
