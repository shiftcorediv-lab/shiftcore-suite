import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");
const wrapper = source.slice(source.indexOf("async function loadShiftData(options"), source.indexOf("async function loadShiftDataContents"));

test("月読込は全処理の完了まで表示し、失敗でも解除する", async () => {
  for (const fail of [false, true]) {
    let finish; let visible = false;
    const context = vm.createContext({
      window: { PortalLoading: { begin(message) { assert.match(message, /^シフト/); visible = true; return () => { visible = false; }; } } },
      loadShiftDataContents: () => new Promise((resolve, reject) => { finish = () => fail ? reject(new Error("offline")) : resolve(); })
    });
    vm.runInContext(wrapper, context);
    const pending = context.loadShiftData();
    assert.equal(visible, true);
    finish();
    if (fail) await assert.rejects(pending, /offline/); else await pending;
    assert.equal(visible, false);
  }
});
test("裏側の再同期は操作を遮らず、自動フォーカスでポップアップを開かない", async () => {
  const context = vm.createContext({ window: {}, loadShiftDataContents: async () => {} });
  vm.runInContext(wrapper, context);
  await context.loadShiftData({ silent: true });
  assert.doesNotMatch(source, /requestAnimationFrame\(\(\) => focusFirstShiftCell/);
  assert.doesNotMatch(source, /ShiftBuilder(?:データ|デモデータ|月次データ)/);
});
