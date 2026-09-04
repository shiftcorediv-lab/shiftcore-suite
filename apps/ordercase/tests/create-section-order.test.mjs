import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createPageSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("案件登録では必要人数・作成件数を稼働条件より先に表示する", () => {
  const staffingSection = createPageSource.indexOf("<h2>必要人数・作成件数</h2>");
  const workConditionSection = createPageSource.indexOf('<section id="workConditionSection">');

  assert.notEqual(staffingSection, -1);
  assert.notEqual(workConditionSection, -1);
  assert.ok(staffingSection < workConditionSection);
});
