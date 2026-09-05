import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCellCountLabel,
  getCellStatus,
} from "../js/shiftbuilder/render-shift-table.js";

const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../js/shiftbuilder/render-detail-panel.js", import.meta.url), "utf8");

test("対象外セルは0 / 0を表示せず対象外として判定する", () => {
  assert.deepEqual(getCellStatus({ required: 0, assigned: [] }), {
    key: "completed",
    label: "対象外",
    note: "",
  });
  assert.equal(getCellCountLabel(0, 0), "");
});

test("配置対象セルは配置数と必要数を空白付きで表示する", () => {
  assert.equal(getCellStatus({ required: 2, assigned: [] }).label, "未配置");
  assert.equal(getCellCountLabel(0, 2), "0 / 2");
  assert.equal(getCellCountLabel(1, 2), "1 / 2");
});

test("表示変更したCSSとJavaScriptは新しい版番号で読み込む", () => {
  assert.match(indexSource, /shiftbuilder\.css\?v=20260905-preference-rules-1/);
  assert.match(indexSource, /main\.js\?v=20260905-preference-rules-1/);
  assert.match(mainSource, /render-shift-table\.js\?v=20260905-identity-labels-1/);
  assert.match(mainSource, /render-detail-panel\.js\?v=20260905-identity-labels-1/);
  assert.match(detailSource, /render-shift-table\.js\?v=20260905-identity-labels-1/);
});
