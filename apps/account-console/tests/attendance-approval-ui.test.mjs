import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildReviewPayload, formatJapanDay, formatJapanTime } from "../js/attendance-admin/attendance-review.js";

const adminUiSource = await readFile(new URL("../js/attendance-admin/main.js", import.meta.url), "utf8");
const adminHtmlSource = await readFile(new URL("../attendance-admin.html", import.meta.url), "utf8");

test("承認payloadへ申請版と判断を設定する", () => {
  assert.deepEqual(buildReviewPayload({ request_id: "REQ-1", request_version: 3 }, "approve", "確認済み"), {
    requestId: "REQ-1",
    expectedRequestVersion: 3,
    decision: "承認",
    reason: "確認済み"
  });
  assert.equal(buildReviewPayload({ request_id: "REQ-1", request_version: 3 }, "reject").decision, "却下");
  for (const decision of ["", "APPROVE", "pending", undefined]) {
    assert.throws(() => buildReviewPayload({ request_id: "REQ-1", request_version: 3 }, decision), /承認または却下/);
  }
});

test("申請版が欠損または不正なら送信payloadを作らない", () => {
  for (const requestVersion of [undefined, "", 0, -1, 1.5, "invalid"]) {
    assert.throws(() => buildReviewPayload({ request_id: "REQ-1", request_version: requestVersion }, "approve"), /版情報を確認できません/);
  }
});

test("オフセットなしの申請日時をJSTとして表示する", () => {
  assert.equal(formatJapanDay("2026-08-19T09:05"), "2026/08/19");
  assert.equal(formatJapanTime("2026-08-19T09:05"), "09:05");
  assert.equal(formatJapanTime("2026-08-19 09:05:30"), "09:05");
  assert.equal(formatJapanTime("2026/08/19 09:05:30.1234"), "09:05");
  assert.equal(formatJapanTime("2026-08-19T00:05:30.000Z"), "09:05");
  assert.equal(formatJapanTime("2026-08-19T09:05+09:00"), "09:05");
  assert.equal(formatJapanTime("09:05"), "09:05");
  assert.equal(formatJapanTime("2026-08-19"), "—");
  assert.equal(formatJapanTime("invalid time"), "—");
});

test("構造化エラーと通信結果不明を区別して表示する", () => {
  assert.match(adminUiSource, /e\.code\?`\$\{e\.code\}: \$\{e\.message\}`/);
  assert.match(adminUiSource, /再押下せず、画面を更新してください/);
});

test("承認画面JavaScriptのキャッシュキーを更新する", () => {
  assert.match(adminHtmlSource, /main\.js\?v=20260831-departure-location-1/);
  assert.match(adminUiSource, /attendance-review\.js\?v=20260819-approval-version-2/);
});
