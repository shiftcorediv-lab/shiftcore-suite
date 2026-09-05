import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const serviceSource=readFileSync(new URL("../backend/ordercase-apps-script/Service_AgenciesMaster.js",import.meta.url),"utf8");
const pageSource=readFileSync(new URL("../agencies.html",import.meta.url),"utf8");
const navigationSource=readFileSync(new URL("../js/navigation.js",import.meta.url),"utf8");

test("代理店マスターは独立した指名・NGと理由を管理する",()=>{
  assert.match(pageSource,/代理店指名メンバー/);
  assert.match(pageSource,/代理店NGメンバー（非推奨）/);
  assert.match(pageSource,/id="editPreferredNote"/);
  assert.match(pageSource,/id="editNgNote"/);
  assert.match(navigationSource,/代理店マスター/);
});

test("代理店のメンバーIDを正規化し指名とNGの重複を拒否する",()=>{
  const context=vm.createContext({});
  vm.runInContext(serviceSource,context);
  assert.equal(context.normalizeAgencyMemberIds_("AN0001, an0001 U-2"),"AN0001,U-2");
  assert.throws(()=>context.validateAgencyMemberRules_("U-1","u-1"),/指名とNGの両方/);
});

test("代理店名変更は店舗へ同期するが過去案件は更新しない",()=>{
  const syncFunction=serviceSource.match(/function syncAgencyNameToStores_[\s\S]*?\n}\n\nfunction updateAgencyMaster_/);
  assert.ok(syncFunction);
  assert.doesNotMatch(syncFunction[0],/SHEET_CASES/);
});

test("初期移行は店舗が空でも過去案件から代理店を補完し案件は書き換えない",()=>{
  const rows={
    stores_master:[],
    cases:[
      {case_id:"CASE-1",agency_id:"",agency_name:"案件のみ代理店"},
      {case_id:"CASE-2",agency_id:"AG-0007",agency_name:"共通代理店"}
    ]
  };
  const context=vm.createContext({
    SHEET_STORES_MASTER:"stores_master",
    SHEET_CASES:"cases",
    getSheetObjects_:sheetName=>rows[sheetName]||[],
    normalizeMasterName_:value=>String(value||"").trim().toLowerCase()
  });
  vm.runInContext(serviceSource,context);
  rows.stores_master.push({store_id:"STORE-1",agency_id:"AG-0007",agency_name:"共通代理店"});

  const plan=context.buildAgenciesMasterMigrationPlan_();

  assert.equal(plan.length,2);
  assert.deepEqual(Array.from(plan.find(item=>item.agency_name==="案件のみ代理店").case_ids),["CASE-1"]);
  assert.equal(plan.find(item=>item.agency_name==="共通代理店").preferred_agency_id,"AG-0007");
  assert.match(serviceSource,/案件自体は履歴として書き換えず/);
});
