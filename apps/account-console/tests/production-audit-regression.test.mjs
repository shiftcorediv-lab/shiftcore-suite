import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('オフのExcelは初回月ではなく選択した月を送信する',async()=>{
  const nodes=new Map();const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',addEventListener(e,fn){this[e]=fn;}});return nodes.get(k);};
  let sent;
  const c=vm.createContext({console,getQueryParams:()=>({}),setupShiftCoreEntryBanner:()=>{},renderEmptyTable:()=>{},
    createResponseGeneration:()=>({}),showLoading:()=>{},hideLoading:()=>{},waitForNextPaint:async()=>{},showMessage:()=>{},
    fetchMonthlyExcel:async m=>{sent=m;return{success:true};},downloadExcelFile:()=>{},
    monthSelect:node('month'),openMonthlyBtn:node('open'),openRequestBtn:node('request'),downloadCsvBtn:node('download'),refreshTableBtn:node('refresh'),backToDashboardBtn:node('back')});
  vm.runInContext(read('../js/pmo-admin/main.js').replace(/^import[\s\S]*?;\n/gm,'').replace('await initializePage();',''),c);
  vm.runInContext('currentMeta={selectedYearMonth:"2026-10"};currentIdToken="mock";monthSelect.value="2026-09";',c);
  await node('download').click();assert.equal(sent,'2026-09');
});
test('勤怠の初回データ取得前の検索で例外を起こさない',()=>{
  const src=read('../js/attendance-admin/main.js');
  const c=vm.createContext({data:null,$:()=>({value:''})});
  vm.runInContext(src.slice(src.indexOf('function renderPeople()'),src.indexOf('function hasCoordinate')),c);
  assert.doesNotThrow(()=>c.renderPeople());
});
test('勤怠の日・月範囲は不正日付を拒否し、月末と年またぎを正しく抽出',()=>{
  const src=read('../backend/attendance-apps-script/Code.gs');
  const c=vm.createContext({today_:()=> '2026-09-13',dateKey_:v=>String(v||''),apiError_:(code,message)=>new Error(message)});
  vm.runInContext(src.slice(src.indexOf('function attendanceAdminRange_'),src.indexOf('function getAdminDashboard_')),c);
  assert.equal(c.attendanceAdminRange_({targetDate:'2026-09-01',viewMode:'day'}).matches('2026-09-02'),false);
  const range=c.attendanceAdminRange_({targetDate:'2026-12-31',viewMode:'month'});
  assert.equal(range.matches('2026-12-01'),true);assert.equal(range.matches('2027-01-01'),false);
  assert.throws(()=>c.attendanceAdminRange_({targetDate:'2026-02-30'}));
});
test('共通ヘッダーは新しいタブで認証済み本人を取得する',()=>{
  const src=read('../../theme/shiftcore-theme.js');
  assert.match(src,/if \(!user\) user = await resolveHeaderUser\(\)/);
  assert.match(src,/resolveCurrentUserWithGasByIdToken\(session.idToken\)/);
});
