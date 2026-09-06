import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL("../shiftcore-theme.js", import.meta.url), "utf8");

test("読込オーバーレイは並行処理と重複解除を安全に扱う", () => {
  const overlay = { setAttribute() {}, querySelector: () => ({ textContent: "" }) };
  const context = vm.createContext({ window: {}, document: { createElement: () => overlay, body: { appendChild() {} } } });
  vm.runInContext(source.slice(source.indexOf("  let loadingCount"), source.indexOf("  const mobileLayoutQuery")), context);
  const done1 = context.window.PortalLoading.begin();
  const done2 = context.window.PortalLoading.begin();
  done1(); done1();
  assert.equal(overlay.hidden, false);
  done2();
  assert.equal(overlay.hidden, true);
});
test("指定4画面は成功・失敗ともfinallyでオーバーレイを解除する", () => {
  for (const file of ["../../ordercase/js/agencies-master.js", "../../ordercase/stores.html", "../../account-console/js/attendance-admin/main.js", "../../account-console/js/work-report-admin/main.js"]) {
    const code = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(code, /PortalLoading\.begin/);
    assert.match(code, /finally\s*\{\s*done\(\)/);
  }
});
test("共通メニューは既存の利用権限判定とセッション消去を使う", () => {
  assert.match(source, /getEffectiveModuleCodes/);
  assert.match(source, /clearShiftCoreSessionState\(\)/);
  assert.match(source, /shiftcore_env/);
  assert.match(source, /e\.key === "Escape"/);
});
