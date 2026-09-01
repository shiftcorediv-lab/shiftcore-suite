import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("案件登録の固定サマリーは横並びの短い項目で表示する", () => {
  const start = source.indexOf("function updateSummary()");
  const end = source.indexOf("// ===== updateSummary ここまで =====", start);
  const updateSummarySource = source.slice(start, end);

  assert.match(source, /\.summary\s*\{[\s\S]*?display:\s*flex;/);
  assert.match(source, /\.summary-item\s*\{[\s\S]*?white-space:\s*nowrap;/);
  assert.equal((updateSummarySource.match(/class="summary-item"/g) || []).length, 4);
  assert.doesNotMatch(updateSummarySource, /<br>/);
  assert.doesNotMatch(updateSummarySource, /1案件あたり/);
});

test("固定バー縮小後も画面下の入力内容が隠れない余白を確保する", () => {
  assert.match(source, /main\s*\{[\s\S]*?padding-bottom:\s*115px;/);
  assert.match(source, /@media \(min-width: 720px\)[\s\S]*?main\s*\{[\s\S]*?padding-bottom:\s*88px;/);
  assert.match(source, /@media \(max-width: 480px\)[\s\S]*?\.summary\s*\{\s*display:\s*none;/);
});
