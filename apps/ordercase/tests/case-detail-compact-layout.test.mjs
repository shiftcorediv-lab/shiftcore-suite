import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailSource = readFileSync(new URL("../case.html", import.meta.url), "utf8");

test("案件詳細はPCでカードを2列に並べ、主要情報だけ全幅にする", () => {
  assert.match(
    detailSource,
    /@media \(min-width: 900px\)[\s\S]*?#detailRoot\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(detailSource, /#detailRoot \.detail-card\.wide\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.equal((detailSource.match(/<section class="detail-card wide">/g) || []).length, 3);
});

test("詳細項目は余白と最低高さを抑え、空欄を控えめに表示する", () => {
  assert.match(
    detailSource,
    /#detailRoot \.field,[\s\S]*?#detailRoot \.memo-box,[\s\S]*?#detailRoot \.date-item\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?padding:\s*10px 12px/,
  );
  assert.match(detailSource, /const emptyClass = displayText === '-' \? ' is-empty' : '';/);
  assert.match(detailSource, /class="field\$\{emptyClass\}"/);
});
