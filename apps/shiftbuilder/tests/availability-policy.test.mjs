import assert from "node:assert/strict";
import test from "node:test";
import { getRequestedOffState } from "../js/shiftbuilder/availability-policy.mjs";

test("対象日が希望休日ならメモとともに判定する", () => {
  assert.deepEqual(
    getRequestedOffState({
      requested_off_dates: ["2026-08-03", "2026-08-10"],
      requested_off_memo: "私用"
    }, "2026-08-10"),
    { requestedOff: true, memo: "私用" }
  );
});

test("別日または未提出は希望休にしない", () => {
  assert.equal(
    getRequestedOffState({ requestedOffDates: ["2026-08-03"] }, "2026-08-04").requestedOff,
    false
  );
  assert.equal(getRequestedOffState(null, "2026-08-04").requestedOff, false);
});
