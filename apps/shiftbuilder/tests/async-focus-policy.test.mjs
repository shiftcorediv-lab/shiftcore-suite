import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePopoverAnchorTarget,
  shouldRefreshActionPopoverForCell,
  wasPopoverAnchorFocused
} from "../js/shiftbuilder/async-focus-policy.mjs";

test("先行保存と別セルを操作中ならポップアップを再描画しない", () => {
  assert.equal(
    shouldRefreshActionPopoverForCell(
      "action",
      { caseId: "CASE-B", date: "2026-08-02" },
      { caseId: "CASE-A", date: "2026-08-01" }
    ),
    false
  );
});

test("保存対象と現在操作中のセルが同じならポップアップを更新する", () => {
  assert.equal(
    shouldRefreshActionPopoverForCell(
      "action",
      { caseId: "CASE-A", date: "2026-08-01" },
      { caseId: "CASE-A", date: "2026-08-01" }
    ),
    true
  );
});

test("通常の再描画では従来どおり現在のポップアップを更新する", () => {
  assert.equal(
    shouldRefreshActionPopoverForCell(
      "action",
      { caseId: "CASE-A", date: "2026-08-01" },
      null
    ),
    true
  );
});

test("案件軸と人員軸の再描画後アンカーをキーから解決する", () => {
  assert.deepEqual(
    resolvePopoverAnchorTarget(
      "action",
      { caseId: "CASE-B", date: "2026-08-02" }
    ),
    { axis: "case", id: "CASE-B", date: "2026-08-02" }
  );
  assert.deepEqual(
    resolvePopoverAnchorTarget(
      "personnel-preview",
      { personId: "USER-B", date: "2026-08-02" }
    ),
    { axis: "personnel", id: "USER-B", date: "2026-08-02" }
  );
});

test("セル自身にフォーカスがあった時だけ再描画後セルへ復元する", () => {
  const oldAnchor = {};
  const popoverCandidate = {};

  assert.equal(wasPopoverAnchorFocused(oldAnchor, oldAnchor), true);
  assert.equal(wasPopoverAnchorFocused(popoverCandidate, oldAnchor), false);
  assert.equal(wasPopoverAnchorFocused(null, oldAnchor), false);
});
