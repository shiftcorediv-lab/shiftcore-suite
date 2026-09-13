import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
test('Excelは旧月次行を消去した一時コピーに画面と同じ行を書き、原本を変更しない',()=>{
  let written,cleared=false,trashed=false;
  const copied={setName(){},getDataRange:()=>({clearContent(){cleared=true;}}),getMaxRows:()=>100,
    getRange:()=>({setValues(v){written=v;}}),getSheetId:()=>2};
  const original={getName:()=> '希望休一覧_202610',copyTo:()=>copied};
  const c=vm.createContext({normalizeText:v=>String(v??'').trim(),isValidYearMonth:()=>true,monthlySheetExists_:()=>true,
    getMonthlyRequestSheet:()=>original,buildMonthlySheetName:()=>original.getName(),
    getPmoMonthlyTable:()=>({success:true,headers:['提出状況','氏名','employee_code','メモ','1日'],rows:[['希望休あり','対象者','AN0014','=formula','×']]}),
    SpreadsheetApp:{create:()=>({getId:()=> 'temporary',getSheets:()=>[copied]})},
    DriveApp:{getFileById:()=>({setTrashed(v){trashed=v;}})},ScriptApp:{getOAuthToken:()=> 'mock'},
    UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getBlob:()=>({getBytes:()=>[]})})},Utilities:{base64Encode:()=> 'mock'}});
  vm.runInContext(readFileSync(new URL('../backend/pmo-apps-script/pmo_admin.js',import.meta.url),'utf8'),c);
  const result=c.exportMonthlyExcel('2026-10','admin');
  assert.equal(result.success,true);assert.equal(cleared,true);assert.equal(trashed,true);
  assert.equal(written.length,2);assert.equal(written[1][2],'AN0014');assert.equal(written[1][3],"'=formula");assert.equal(written[1][4],'×');
});
