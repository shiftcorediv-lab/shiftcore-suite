import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminUiSource = fs.readFileSync(new URL("../js/attendance-admin/main.js", import.meta.url), "utf8");
const adminHtmlSource = fs.readFileSync(new URL("../attendance-admin.html", import.meta.url), "utf8");

test("承認画面は申請版を送信し、競合コードを表示する", () => {
  assert.match(adminUiSource, /const expectedRequestVersion=Number\(reviewRequest\.request_version\)/);
  assert.match(adminUiSource, /Number\.isInteger\(expectedRequestVersion\)/);
  assert.match(adminUiSource, /requestId:reviewRequest\.request_id,expectedRequestVersion,decision/);
  assert.match(adminUiSource, /message\(e\.code\?`\$\{e\.code\}: \$\{e\.message\}`/);
});

test("承認画面は対象日時を表示する", () => {
  assert.match(adminUiSource, /reviewRequest\["実勤務日"\]/);
  assert.match(adminUiSource, /reviewRequest\["申請開始"\]/);
  assert.match(adminUiSource, /reviewRequest\["申請終了"\]/);
});

test("承認画面JavaScriptのキャッシュキーを更新する", () => {
  assert.match(adminHtmlSource, /main\.js\?v=20260819-approval-version-1/);
});
