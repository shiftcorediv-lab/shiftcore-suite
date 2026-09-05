import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const editSource = readFileSync(new URL("../edit.html", import.meta.url), "utf8");

test("案件登録と通常編集の成功後にシフト更新を通知する", () => {
  assert.match(createSource, /sessionStorage\.setItem\('ordercase_force_list_refresh', '1'\);\s*notifyShiftBuilderDataChanged\(\);/);
  assert.match(editSource, /state\.caseDetail = Object\.assign[\s\S]*?sessionStorage\.setItem\('ordercase_force_list_refresh', '1'\);\s*notifyShiftBuilderDataChanged\(\);/);
});

test("案件更新通知はシフトとダッシュボードで共有するキーを使う", () => {
  for (const source of [createSource, editSource]) {
    assert.match(source, /shiftcore-shiftbuilder-data-revision-v1/);
    assert.match(source, /localStorage\.setItem\(\s*SHIFTBUILDER_DATA_REVISION_KEY/);
  }
});
