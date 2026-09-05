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
  assert.match(serviceSource,/function syncAgencyNameToStores_/);
  assert.doesNotMatch(serviceSource,/SHEET_CASES/);
});
