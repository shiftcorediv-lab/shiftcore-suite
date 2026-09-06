import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCaseIdentityLabel,
  getCompactCaseId,
  getCompactMemberLabel,
} from "../js/shiftbuilder/display-labels.mjs";

const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");

test("同姓メンバーは姓名を省略せず表示する", () => {
  assert.equal(
    getCompactMemberLabel({ family_name: "細見", given_name: "大樹" }),
    "細見 大樹"
  );
  assert.equal(
    getCompactMemberLabel({ family_name: "細見", given_name: "太郎" }),
    "細見 太郎"
  );
});

test("構造化された姓名がない場合は既存の表示名を維持する", () => {
  assert.equal(getCompactMemberLabel({ display_name: "表示名のみ" }), "表示名のみ");
  assert.equal(getCompactMemberLabel({}, "USR-001"), "USR-001");
});

test("人員軸は短い案件番号と完全な識別名を使い分ける", () => {
  const assignment = {
    caseId: "CASE-202609-0001",
    caseDisplayTitle: "DSテスト1店",
  };

  assert.equal(getCompactCaseId(assignment.caseId), "#0001");
  assert.equal(
    getCaseIdentityLabel(assignment),
    "DSテスト1店（CASE-202609-0001）"
  );
});

test("両軸の日付列幅を描画時にも96pxで維持する", () => {
  assert.match(mainSource, /shiftData\.dates\.length \* 96/);
  assert.match(mainSource, /style\.minWidth = elements\.shiftTable\.style\.width/);
});
