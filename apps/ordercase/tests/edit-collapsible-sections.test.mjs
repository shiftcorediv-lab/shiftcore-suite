import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editPageSource = readFileSync(new URL("../edit.html", import.meta.url), "utf8");

test("案件編集の主要6区分は個別に折りたためる", () => {
  const buttons = editPageSource.match(/data-section-collapse aria-expanded="true"/g) || [];

  assert.equal(buttons.length, 6);
  assert.match(editPageSource, /class="collapsible-section"/);
  assert.match(editPageSource, /classList\.toggle\('is-collapsed'\)/);
  assert.match(editPageSource, /aria-expanded="true"/);
  assert.match(editPageSource, /indicator\.textContent = collapsed \? '開く' : '閉じる'/);
  assert.match(
    editPageSource,
    /el\.id === 'saveButton' \|\| el\.matches\('\[data-section-collapse\]'\)/,
  );
});

test("変更理由は保存に必須のため折りたたみ対象にしない", () => {
  const changeReasonStart = editPageSource.indexOf('<section class="change-reason-card">');
  const changeReasonEnd = editPageSource.indexOf("</section>", changeReasonStart);
  const changeReasonSection = editPageSource.slice(changeReasonStart, changeReasonEnd);

  assert.notEqual(changeReasonStart, -1);
  assert.doesNotMatch(changeReasonSection, /data-section-collapse/);
});
