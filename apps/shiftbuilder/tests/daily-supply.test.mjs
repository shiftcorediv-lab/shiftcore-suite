import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildPersonnelAxisViewModel} from '../js/shiftbuilder/personnel-axis-view-model.js';
const source=readFileSync(new URL('../backend/shiftbuilder-apps-script/ShiftBuilderService.js',import.meta.url),'utf8');
const norm=value=>String(value||'').trim();
function harness(){const context=vm.createContext({normalizeText:norm,normalizeLowerText:value=>norm(value).toLowerCase(),normalizeMonth:norm});vm.runInContext(source,context);return context;}
test('全稼働対象の提出数は操作権限と無関係・未提出/停止/開発者/稼働対象外を除外',()=>{
  const context=harness();
  const user=(id,extra={})=>({internal_user_id:id,status:'active',role:'staff',work_status:'on',...extra});
  const users=[user('U1'),user('U2'),user('U2'),user('U3',{status:'inactive'}),user('U4',{role:'developer'}),user('U5',{work_status:'off'}),user('U6'),user('U7',{engagement_status:'inactive'})];
  const requests=Object.fromEntries(users.map(u=>[u.internal_user_id,{submit_type:'希望休なし',requested_off_dates:[]}]));
  requests.U2={submit_type:'希望休あり',requested_off_dates:['2026-10-02']};delete requests.U6;
  const supply=context.buildShiftBuilderDailySupply_('2026-10',users,requests);
  assert.equal(Object.keys(supply).length,31);assert.equal(supply['2026-10-01'],2);assert.equal(supply['2026-10-02'],1);
  const dates=[{date:'2026-10-01'},{date:'2026-10-02'}];
  const cases=[{cells:{'2026-10-01':{required:3},'2026-10-02':{required:1}}}];
  const model=buildPersonnelAxisViewModel({dates,cases},[],null,false,supply);
  assert.equal(model.people.length,0); // 集計対象の拡大で配置候補・操作権限は増やさない。
  assert.equal(model.dailySummary[0].balance,-1);assert.equal(model.dailySummary[1].balance,0);
});
test('全体数が未取得・旧APIなら候補者数で代用しない',()=>{
  const dates=[{date:'2026-10-01'}];
  const candidates=[{internal_user_id:'U1',pmo_submitted:true,requested_off_dates:[]}];
  const model=buildPersonnelAxisViewModel({dates,cases:[]},candidates,null,false,null);
  assert.equal(model.dailySummary[0].submitted,null);assert.equal(model.dailySummary[0].balance,null);
});
test('候補者APIは名簿と希望休を一度ずつ読み、追加の集計だけ返す',()=>{
  const context=harness();let reads=0,requests=0;
  context.requireShiftBuilderOperator_=()=>({});context.buildShiftBuilderUser_=()=>({});context.ok_=value=>value;
  context.getUsersMasterRows_=()=>{reads++;return [];};context.getLatestPmoRequestsByUserForMonth_=()=>{requests++;return {};};
  const result=context.shiftBuilderGetAssignmentCandidates({targetMonth:'2026-10',area:'all'});
  assert.equal(reads,1);assert.equal(requests,1);assert.equal(result.candidates.length,0);assert.equal(result.daily_supply['2026-10-01'],0);
  assert.equal(context.shiftBuilderGetAssignmentCandidates({targetMonth:'2026-10',area:'fukuoka'}).daily_supply['2026-10-01'],0);
});
test('エリア別は登録拠点が一致する人のみ・日本語名とコードに対応・未設定は全エリアのみ',()=>{
  const context=harness();
  const users=['福岡','fukuoka','北九州','','関西'].map((base_area,i)=>({internal_user_id:'U'+i,status:'active',work_status:'on',base_area}));
  const requests=Object.fromEntries(users.map(u=>[u.internal_user_id,{submit_type:'希望休なし',requested_off_dates:[]}]));
  const count=area=>context.buildShiftBuilderDailySupply_('2026-10',users,requests,area)['2026-10-01'];
  assert.equal(count('all'),5);assert.equal(count('fukuoka'),2);assert.equal(count('福岡'),2);
  assert.equal(count('kitakyushu'),1);assert.equal(count('saga'),0);assert.equal(count('関西'),1);
});
test('10月の本番画面で確認した提出1名・希望休8日・1日の受注2名を再現する',()=>{
  // 2026-09-13の画面読み取りを匿名化。本番への書き込みやAPI成功を代替するテストではない。
  const context=harness();
  const users=[{internal_user_id:'TEST',status:'active',work_status:'on',base_area:''}];
  const off=[2,9,10,11,12,13,30,31].map(day=>'2026-10-'+String(day).padStart(2,'0'));
  const supply=context.buildShiftBuilderDailySupply_('2026-10',users,{TEST:{submit_type:'希望休あり',requested_off_dates:off}},'all');
  assert.equal(Object.values(supply).reduce((a,b)=>a+b,0),23);
  const dates=Object.keys(supply).map(date=>({date}));
  const cases=[{cells:{'2026-10-01':{required:1}}},{cells:{'2026-10-01':{required:1}}}];
  const model=buildPersonnelAxisViewModel({dates,cases},[],null,false,supply);
  assert.equal(model.dailySummary[0].submitted,1);assert.equal(model.dailySummary[0].required,2);assert.equal(model.dailySummary[0].balance,-1);
  assert.equal(model.dailySummary[1].balance,0);assert.equal(model.dailySummary[2].balance,1);
  assert.equal(context.buildShiftBuilderDailySupply_('2026-10',users,{TEST:{submit_type:'希望休なし'}},'fukuoka')['2026-10-01'],0);
});
