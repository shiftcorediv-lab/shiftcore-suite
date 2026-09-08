import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCellCountLabel,
  getCellStatus,
  renderShiftTable,
} from "../js/shiftbuilder/render-shift-table.js";

const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../js/shiftbuilder/render-detail-panel.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../css/shiftbuilder.css", import.meta.url), "utf8");

test("両軸のセルは従来80pxの半分以下で高さを揃える", () => {
  assert.match(cssSource, /\.case-agency-break td \{\s*border-top: 8px solid #f5f5f3;/);
  for (const selector of ["shift-cell", "personnel-shift-cell"]) {
    const rule = cssSource.match(new RegExp(`\\.${selector} \\{([^}]+)\\}`))[1];
    assert.match(rule, /height:\s*36px/);
    assert.match(rule, /min-height:\s*36px/);
  }
  assert.match(cssSource, /\.shift-table \.case-meta, \.shift-table \.personnel-meta, \.shift-table \.personnel-account \{ display: none; \}/);
});

test("対象外セルは0 / 0を表示せず対象外として判定する", () => {
  assert.deepEqual(getCellStatus({ required: 0, assigned: [] }), {
    key: "completed",
    label: "対象外",
    note: "",
  });
  assert.equal(getCellCountLabel(0, 0), "");
});

test("詳細確認用の配置数と必要数は保持する", () => {
  assert.equal(getCellStatus({ required: 2, assigned: [] }).label, "未配置");
  assert.equal(getCellCountLabel(0, 2), "0 / 2");
  assert.equal(getCellCountLabel(1, 2), "1 / 2");
});

test("未配置セルは人数比率を表示せず、必要人数はツールチップに残す", (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { ShiftCoreEnvironment: { withEnvironment: url => url } };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  for (const required of [1, 2]) {
    const body = { innerHTML: "", querySelectorAll: () => [] };
    renderShiftTable({
      dates: [{ date: "2026-09-14", weekday: "月" }],
      cases: [{ caseId: "TEST", caseTitle: "検証", cells: {
        "2026-09-14": { required, assigned: [] }
      } }]
    }, { shiftTableHead: { innerHTML: "" }, shiftTableBody: body });
    assert.match(body.innerHTML, /未配置/);
    assert.doesNotMatch(body.innerHTML, /class="shift-cell-count"/);
    assert.match(body.innerHTML, new RegExp(`配置0名 / 必要${required}名`));
  }
});

test("表示変更したCSSとJavaScriptは新しい版番号で読み込む", () => {
  assert.match(indexSource, /shiftbuilder\.css\?v=20260907-member-management-1/);
  assert.match(indexSource, /main\.js\?v=20260909-member-display-1/);
  assert.match(mainSource, /render-shift-table\.js\?v=20260909-member-display-1/);
  assert.match(mainSource, /render-detail-panel\.js\?v=20260909-member-display-1/);
  assert.match(detailSource, /render-shift-table\.js\?v=20260909-member-display-1/);
});
