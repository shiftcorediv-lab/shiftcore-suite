import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCaseMemberPreference } from "../js/shiftbuilder/assignment-preference-policy.mjs";

const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../js/shiftbuilder/render-detail-panel.js", import.meta.url), "utf8");

test("代理店・店舗ルールは設定元を分け、店舗設定を優先する", () => {
  const caseItem = {
    agency_preferred_member_ids: ["u-preferred", "u-store-ng"],
    agency_ng_member_ids: ["an0099", "u-store-preferred"],
    store_preferred_member_ids: ["u-store-preferred"],
    store_ng_member_ids: ["u-store-ng"]
  };
  assert.equal(getCaseMemberPreference(caseItem, { internal_user_id: "U-PREFERRED" }).effectiveType, "agency-preferred");
  assert.equal(getCaseMemberPreference(caseItem, { account_code: "AN0099" }).effectiveType, "agency-ng");
  assert.equal(getCaseMemberPreference(caseItem, { internal_user_id: "U-STORE-PREFERRED" }).effectiveType, "store-preferred");
  assert.equal(getCaseMemberPreference(caseItem, { internal_user_id: "U-STORE-NG" }).effectiveType, "store-ng");
  assert.deepEqual(getCaseMemberPreference(caseItem, { internal_user_id: "U-STORE-PREFERRED" }).badgeLabels, ["店舗指名", "代理店NG"]);
});

test("候補画面は指名を優先しNGも確認後に配置できる", () => {
  assert.match(mainSource, /buttonLabel = preference\.isPreferred \? "指名をアサイン"/);
  assert.match(mainSource, /buttonLabel = "確認してアサイン"/);
  assert.doesNotMatch(mainSource, /NG配置不可/);
  assert.match(mainSource, /confirmNgPreferenceAssignment/);
  assert.match(detailSource, /candidate-relation-badge/);
  assert.match(detailSource, /preferenceBadges/);
});
