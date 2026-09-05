import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCaseMemberPreference } from "../js/shiftbuilder/assignment-preference-policy.mjs";

const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../js/shiftbuilder/render-detail-panel.js", import.meta.url), "utf8");

test("店舗ルールは内部IDとアカウントコードの両方で一致する", () => {
  const caseItem = {
    preferred_member_ids: ["u-preferred"],
    ng_member_ids: ["an0099"]
  };
  assert.deepEqual(getCaseMemberPreference(caseItem, { internal_user_id: "U-PREFERRED" }), {
    isPreferred: true,
    isNg: false
  });
  assert.deepEqual(getCaseMemberPreference(caseItem, { account_code: "AN0099" }), {
    isPreferred: false,
    isNg: true
  });
  assert.deepEqual(getCaseMemberPreference({ preferred_member_ids: ["U-1"], ng_member_ids: ["U-1"] }, { internal_user_id: "U-1" }), {
    isPreferred: false,
    isNg: true
  });
});

test("候補画面は推しを優先しNGを操作不可として表示する", () => {
  assert.match(mainSource, /buttonLabel = preference\.isPreferred \? "推しをアサイン"/);
  assert.match(mainSource, /buttonLabel = "NG配置不可"/);
  assert.match(mainSource, /if \(preference\.isNg\) \{\s*return \[\];/);
  assert.match(detailSource, /candidate-relation-badge is-preferred/);
  assert.match(detailSource, /candidate-relation-badge is-ng/);
});
