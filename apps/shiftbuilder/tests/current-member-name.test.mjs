import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildPersonnelAxisViewModel } from "../js/shiftbuilder/personnel-axis-view-model.js";
import { buildCaseCsv } from "../js/shiftbuilder/export-utils.mjs";

test("既存配置も現在の表示用名を読み、削除済みメンバーは保存済み名を維持する", () => {
  const context = vm.createContext({
    DEFAULT_TIME_SLOT: "all_day",
    normalizeTimeString: value => String(value || "").trim(),
    normalizeText: value => String(value || "").trim(),
    normalizeLowerText: value => String(value || "").trim().toLowerCase()
  });
  vm.runInContext(readFileSync(new URL("../backend/shiftbuilder-apps-script/repositore.js", import.meta.url), "utf8"), context);
  const assignments = [{internal_user_id:"U1",display_name:"旧名",assignment_id:"A1"}];
  const current = {U1:{display_name:"新表示名",family_name:"山田",given_name:"太郎"}};
  assert.equal(context.buildAssignedMembers_(assignments,current)[0].display_name,"新表示名");
  current.U1.display_name = " ";
  assert.equal(context.buildAssignedMembers_(assignments,current)[0].display_name,"山田 太郎");
  assert.equal(context.buildAssignedMembers_(assignments,{})[0].display_name,"旧名");
  assert.equal(assignments[0].display_name,"旧名");
});

test("人員軸とCSVも表示用名を優先し、同名でもIDを分ける", () => {
  const people = ["U1","U2"].map(internal_user_id => ({internal_user_id,display_name:"表示用",family_name:"山田",given_name:"太郎"}));
  const model = buildPersonnelAxisViewModel({dates:[],cases:[]}, people);
  const rows = model.people;
  assert.equal(rows.length,2);
  assert.equal(rows[0].displayName,"表示用");
  const csv = buildCaseCsv({cells:{"2026-09-01":{required:1,assigned:[people[0]]}}},[{date:"2026-09-01"}]);
  assert.match(csv,/表示用/);
  assert.doesNotMatch(csv,/山田/);
});
