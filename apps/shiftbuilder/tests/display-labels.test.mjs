import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCaseIdentityLabel,
  getCompactCaseId,
  getCompactMemberLabel,
  getCalendarDayLabel,
} from "../js/shiftbuilder/display-labels.mjs";

const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");

test("月全体表示の日付見出しは日だけを表示する", () => {
  assert.equal(getCalendarDayLabel({date:"2026-10-01",label:"10/1"}), "1");
  assert.equal(getCalendarDayLabel({date:"2026-10-31",label:"10/31"}), "31");
  assert.equal(getCalendarDayLabel({label:"日付不明"}), "日付不明");
});

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

test("月全体の幅はCSSへ委譲し、日数だけを渡す", () => {
  assert.match(mainSource, /setProperty\("--shift-day-count", shiftData\.dates\.length\)/);
  assert.doesNotMatch(mainSource, /shiftTable\.style\.(?:minWidth|width)\s*=/);
});
