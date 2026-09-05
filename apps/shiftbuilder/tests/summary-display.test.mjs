import assert from "node:assert/strict";
import test from "node:test";

import { calculateSummary, renderSummary } from "../js/shiftbuilder/render-summary.js";

test("必要人数がない月は充足率を100%と断定しない", () => {
  assert.deepEqual(calculateSummary({ cases: [], dates: [] }), {
    requiredTotal: 0,
    assignedTotal: 0,
    shortageTotal: 0,
    completionRate: null
  });

  const elements = {
    requiredTotalText: {},
    assignedTotalText: {},
    shortageTotalText: {},
    completionRateText: {}
  };
  renderSummary({ cases: [], dates: [] }, elements);
  assert.equal(elements.completionRateText.textContent, "—");
});

test("必要人数がある月は従来どおり充足率を表示する", () => {
  const data = {
    dates: [{ date: "2026-09-01" }],
    cases: [{ cells: { "2026-09-01": { required: 4, assigned: [{}, {}] } } }]
  };
  assert.equal(calculateSummary(data).completionRate, 50);
});
