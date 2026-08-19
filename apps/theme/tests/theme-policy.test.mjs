import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../shiftcore-theme.js", import.meta.url), "utf8");

test("未選択時は従来表示のライトモードを使う", () => {
  assert.match(source, /return storedTheme\(\) \|\| "light"/);
});

test("テーマ切り替えをアカウントメニューへ配置する", () => {
  assert.match(source, /userMenuPanel/);
  assert.match(source, /アカウント・表示設定を開く/);
  assert.match(source, /data-shiftcore-theme-option/);
  assert.doesNotMatch(source, /shiftcore-theme-toggle/);
});
