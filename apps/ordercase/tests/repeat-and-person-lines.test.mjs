import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const context = vm.createContext({window:{}});
vm.runInContext(read('../js/repeat-policy.js'), context);
vm.runInContext(read('../backend/ordercase-apps-script/Service_Cases.js'), context);
vm.runInContext(read('../backend/ordercase-apps-script/Util_Format.js'), context);
const person = (amount = '') => ({work_start_time:'10:00',work_end_time:'18:00',amount});
const payload = () => ({input_mode:'dates',amount_type:'per_person_day',amount:10000,work_start_time:'10:00',work_end_time:'18:00',case_dates:[{work_date:'2026-10-01',person_conditions:[person(0),person(20000),person(30000)]},{work_date:'2026-10-02',person_conditions:[person()]}]});
test('反復受注は共通条件とメモを引き継ぐが識別・日付・状態は引き継がない', () => {
  const fields = context.window.OrderCaseRepeatPolicy.buildFields({case_id:'OLD',target_month:'2020-01',status:'confirmed',case_rank:'A',shiftcore_display_name:'梅田催事',store_id:'STORE',amount_type:'per_person_day',amount:0,internal_memo:'確認事項',case_dates:[{work_date:'2020-01-01'}]}, [{store_id:'STORE',store_short_name:'梅田店'}]);
  assert.equal(fields.shiftcoreDisplayName,'梅田催事'); assert.equal(fields.storeShortName,'梅田店');
  assert.equal(fields.amount,0); assert.equal(fields.internalMemo,'確認事項');
  for (const key of ['caseId','targetMonth','status','caseRank','case_dates']) assert.equal(fields[key],undefined);
});
test('古い単価区分を無断換算しない', () => {
  const fields=context.window.OrderCaseRepeatPolicy.buildFields({amount_type:'per_line_day',amount:20000});
  assert.equal(fields.amountType,''); assert.equal(fields.amount,'');
});
test('日ごとに異なる人数と人数別単価を許可する', () => assert.doesNotThrow(()=>context.validatePersonConditions_(payload(),3)));
test('人数・単価の不正値と共通異時間者の併用を拒否する', () => {
  assert.throws(()=>context.validatePersonConditions_(payload(),2));
  for (const value of [-1,'abc']) { const p=payload();p.case_dates[0].person_conditions[0].amount=value;assert.throws(()=>context.validatePersonConditions_(p,3)); }
  const p=payload();p.has_alternate_time_workers=true;assert.throws(()=>context.validatePersonConditions_(p,3));
  p.has_alternate_time_workers=false;p.amount_type='per_case';assert.throws(()=>context.validatePersonConditions_(p,3));
});
test('人数の少ない日に不要な案件日付を作らず単価0も保持する', () => {
  const p=payload();
  const first=context.buildSinglePersonCasePayload_(p,{copy_index:1,copy_count:3},{});
  const third=context.buildSinglePersonCasePayload_(p,{copy_index:3,copy_count:3},{});
  assert.equal(first.case_dates.length,2);assert.equal(first.case_dates[0].unit_amount_override,0);
  assert.equal(third.case_dates.length,1);assert.equal(third.case_dates[0].unit_amount_override,30000);
  assert.equal(p.case_dates[0].person_conditions.length,3);
});
test('旧形式の登録は保持する', () => {
  const p=payload();delete p.case_dates[0].person_conditions;delete p.case_dates[1].person_conditions;
  assert.doesNotThrow(()=>context.validatePersonConditions_(p,2));
  assert.equal(context.buildSinglePersonCasePayload_(p,{copy_index:2,copy_count:2},{}).case_dates.length,2);
});
test('旧バックエンドへの人数別条件の誤保存を防ぐ', () => {
  assert.match(read('../index.html'), /supports_person_conditions !== true/);
  assert.match(read('../backend/ordercase-apps-script/Service_Bootstrap.js'), /supports_person_conditions: true/);
});
test('人数と人数別条件は別一覧ではなくカレンダーの日付直下に配置する', () => {
  const source = read('../index.html');
  assert.match(source, /cell\.appendChild\(button\)/);
  assert.match(source, /label\.appendChild\(countInput\); cell\.appendChild\(label\)/);
  assert.match(source, /if \(cell\) cell\.appendChild\(row\)/);
  assert.doesNotMatch(source, /list\.appendChild\(row\)/);
  assert.match(source, /if \(count === 0\) \{ toggleDate\(item\.work_date\); return; \}/);
});
test('1名では個別欄を表示せず、人数を1名へ戻した場合は共通条件へ戻す', () => {
  const source = read('../index.html');
  assert.match(source, /item\.person_conditions\.length >= 2 \? item\.person_conditions : \[\]/);
  assert.match(source, /count >= 2 && item\.person_conditions\[i\] \|\| \{work_start_time:'',work_end_time:'',amount:''\}/);
});
