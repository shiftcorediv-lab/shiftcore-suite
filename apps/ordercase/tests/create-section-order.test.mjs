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

test("実稼働先情報は連携店舗と異なる場所で稼働するときだけ表示・送信する", () => {
  assert.match(createPageSource, /id="hasSeparateWorkLocation" type="checkbox"/);
  assert.match(createPageSource, /id="workAddressWrap" class="hidden"/);
  assert.match(createPageSource, /id="workNearestStationWrap" class="hidden"/);
  assert.match(createPageSource, /toggleWrap\('workAddressWrap', usesSeparateLocation\)/);
  assert.match(createPageSource, /work_address: usesSeparateLocation \?/);
  assert.match(createPageSource, /work_nearest_station: usesSeparateLocation \?/);
});
