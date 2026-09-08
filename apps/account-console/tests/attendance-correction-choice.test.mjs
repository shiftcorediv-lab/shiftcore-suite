import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/dashboard/main.js", import.meta.url), "utf8");
const functionSource = name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))[0];

for (const name of ['submitDeparture', 'submitNearestArrival']) {
  test(`${name}: 保存確定後すぐ通知し、再取得完了までは処理を終えない`, async () => {
    const events = [];
    let resolveSave, resolveRefresh, finished = false;
    const save = new Promise(resolve => { resolveSave = resolve; });
    const refresh = new Promise(resolve => { resolveRefresh = resolve; });
    const c = vm.createContext({ busy: false, dashboardData: { schedule: { schedule_id: 'S1' } },
      openDialog: async () => true, readAttendanceLocation: async () => ({}),
      runAction: async action => action(), attendanceRequest: () => save,
      showFieldReportResult: () => events.push('saved'),
      loadDashboard: () => { events.push('refresh'); return refresh; } });
    vm.runInContext(functionSource(name), c);
    const pending = c[name]().then(() => { finished = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, [], '保存前に成功を表示しない');
    resolveSave({ ok: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['saved', 'refresh']);
    assert.equal(finished, false);
    resolveRefresh(); await pending;
    assert.equal(finished, true);
  });
  test(`${name}: 保存失敗なら成功通知も再取得も行わない`, async () => {
    const c = vm.createContext({ busy: false, dashboardData: { schedule: { schedule_id: 'S1' } },
      openDialog: async () => true, readAttendanceLocation: async () => ({}),
      runAction: async action => action(), attendanceRequest: async () => { throw new Error('保存失敗'); },
      showFieldReportResult: () => assert.fail('成功通知禁止'), loadDashboard: () => assert.fail('再取得禁止') });
    vm.runInContext(functionSource(name), c);
    await assert.rejects(c[name](), /保存失敗/);
  });
}

test("通知失敗は打刻保存済みの警告として表示する", () => {
  let result;
  const context = vm.createContext({ showAlert: (message, type) => { result = { message, type }; } });
  vm.runInContext(functionSource("showFieldReportResult"), context);
  context.showFieldReportResult("出発", { notificationStatus: "failed" });
  assert.equal(result.type, "warning");
  assert.match(result.message, /打刻は保存されています。再打刻は不要/);
  context.showFieldReportResult("最寄り到着", { notificationStatus: "sent" });
  assert.equal(result.type, "success");
});

for (const type of ["開始修正", "終了修正"]) {
  test(`開始済みスタッフが${type}を選んで対象の記録を申請できる`, async () => {
    const calls = [];
    const elements = { correctionType: { value: type }, actualTime: { value: "2026-09-07T10:00" }, reasonType: { value: "失念" } };
    const context = vm.createContext({
      busy: false, dashboardData: { record: { record_id: "R1", 実開始: "2026-09-07T09:00" } },
      $: id => elements[id],
      openDialog: async () => { context.dashboardData = { record: { record_id: "R2" } }; return true; },
      reasonFields: () => "", readReason: () => "失念：時刻を訂正", showStatus() {}, showAlert() {},
      runAction: async action => action(), loadDashboard: async () => {},
      attendanceRequest: async (action, payload) => calls.push({ action, payload })
    });
    vm.runInContext(functionSource("chooseCorrection") + "\n" + functionSource("openCorrection"), context);
    await context.chooseCorrection();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.recordId, "R1", "表示更新で別の勤怠を修正しない");
    assert.equal(calls[0].payload.type, type);
    assert.equal(calls[0].payload.actualStart, type === "開始修正" ? elements.actualTime.value : "");
    assert.equal(calls[0].payload.actualEnd, type === "終了修正" ? elements.actualTime.value : "");
  });
}

test("修正対象なし・処理中・キャンセルでは修正へ進まない", async () => {
  for (const state of [{ busy: true, record: { record_id: "R1" } }, { busy: false, record: null }, { busy: false, record: { record_id: "R1" } }]) {
    let opened = false;
    const context = vm.createContext({ busy: state.busy, dashboardData: { record: state.record }, openDialog: async () => false, openCorrection: async () => { opened = true; } });
    vm.runInContext(functionSource("chooseCorrection"), context);
    await context.chooseCorrection();
    assert.equal(opened, false);
  }
});

test("最寄り到着の位置取得失敗も共通のエラー処理内で扱う", async () => {
  let caught = false;
  const context = vm.createContext({
    busy: false, dashboardData: { schedule: { schedule_id: "S1" } }, openDialog: async () => true,
    readAttendanceLocation: async () => { throw new Error("位置取得失敗"); },
    runAction: async action => { try { await action(); } catch { caught = true; } },
    attendanceRequest: async () => assert.fail("位置取得失敗時は送信しない")
  });
  vm.runInContext(functionSource("submitNearestArrival"), context);
  await context.submitNearestArrival();
  assert.equal(caught, true);
});

test("再度開くダイアログは前回の承認値を引き継がない", () => {
  assert.match(functionSource("openDialog"), /returnValue = "";\s*\$\("actionDialog"\)\.showModal/);
});
