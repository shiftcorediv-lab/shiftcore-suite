import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const serviceSource = readFileSync(new URL("../backend/ordercase-apps-script/Service_StoresMaster.js", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../stores.html", import.meta.url), "utf8");

test("店舗マスターは推し・NGメンバーを編集できる", () => {
  assert.match(pageSource, /id="editPreferredMemberIds"/);
  assert.match(pageSource, /id="editNgMemberIds"/);
  assert.match(pageSource, /preferred_member_ids:editPreferredMemberIds\.value\.trim\(\)/);
  assert.match(pageSource, /ng_member_ids:editNgMemberIds\.value\.trim\(\)/);
});

test("推し・NGのIDは重複を除去し不正値を拒否する", () => {
  const context = vm.createContext({});
  vm.runInContext(serviceSource, context);
  assert.equal(context.normalizeStoreMemberIds_("AN0001, an0001、U-002"), "AN0001,U-002");
  assert.throws(() => context.normalizeStoreMemberIds_("=IMPORTXML()"), /内部IDまたはアカウントコード/);
  assert.match(serviceSource, /同じメンバーを推しとNGの両方には登録できません/);
});
