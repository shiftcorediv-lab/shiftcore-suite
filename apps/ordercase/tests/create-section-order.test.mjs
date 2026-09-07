import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createPageSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("独立した作成件数カードを廃止し日数指定に必要人数を残す", () => {
  assert.doesNotMatch(createPageSource, /<h2>必要人数・作成件数<\/h2>/);
  const section = createPageSource.match(/<section id="daysSection" class="hidden">([\s\S]*?)<\/section>/)[1];
  assert.match(section, /id="requestedDays"/);
  assert.match(section, /for="sameConditionCount">必要人数<\/label>/);
  assert.match(section, /id="hasAlternateTimeWorkers"/);
  assert.equal((createPageSource.match(/id="sameConditionCount"/g) || []).length, 1);
  assert.equal((createPageSource.match(/id="requestedDays"/g) || []).length, 1);
});

test("実稼働先情報は連携店舗と異なる場所で稼働するときだけ表示・送信する", () => {
  assert.match(createPageSource, /id="hasSeparateWorkLocation" type="checkbox"/);
  assert.match(createPageSource, /id="workAddressWrap" class="hidden"/);
  assert.match(createPageSource, /id="workNearestStationWrap" class="hidden"/);
  assert.match(createPageSource, /toggleWrap\('workAddressWrap', usesSeparateLocation\)/);
  assert.match(createPageSource, /work_address: usesSeparateLocation \?/);
  assert.match(createPageSource, /work_nearest_station: usesSeparateLocation \?/);
});
