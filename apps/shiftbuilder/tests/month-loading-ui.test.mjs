import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");
const wrapper = source.slice(source.indexOf("let shiftLoadGeneration ="), source.indexOf("async function loadShiftDataContents"));

test("当月未取得のまま終了・失敗した場合も読込表示を解除する", async () => {
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
test("当月を先行表示したら補助要求完了前に解除し、古い月の結果は無効になる", async () => {
  const pending = [];
  let visible = 0;
  const context = vm.createContext({
    window: { PortalLoading: { begin() { visible++; return () => visible--; } } },
    loadShiftDataContents: options => new Promise(resolve => pending.push({ options, resolve }))
  });
  vm.runInContext(wrapper, context);
  const first = context.loadShiftData();
  assert.equal(visible, 1);
  pending[0].options.onPrimaryReady();
  assert.equal(visible, 0);
  const second = context.loadShiftData();
  assert.equal(pending[0].options.isCurrent(), false);
  assert.equal(pending[1].options.isCurrent(), true);
  pending[0].resolve(); await first;
  assert.equal(visible, 1);
  pending[1].resolve(); await second;
  assert.equal(visible, 0);
});
test("裏側の再同期は操作を遮らず、自動フォーカスでポップアップを開かない", async () => {
  const context = vm.createContext({ window: {}, loadShiftDataContents: async () => {} });
  vm.runInContext(wrapper, context);
  await context.loadShiftData({ silent: true });
  assert.doesNotMatch(source, /requestAnimationFrame\(\(\) => focusFirstShiftCell/);
  assert.doesNotMatch(source, /ShiftBuilder(?:データ|デモデータ|月次データ)/);
});
