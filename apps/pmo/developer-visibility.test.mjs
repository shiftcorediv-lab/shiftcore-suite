import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("PMOは上流名簿に開発者が混入しても表示対象から除外する", () => {
  const context = vm.createContext({
    normalizeText: (value) => String(value == null ? "" : value).trim(),
    SETTINGS: { EXCLUDED_WORK_STATUSES_FOR_MONTHLY: ["off"] }
  });
  vm.runInContext(
    readFileSync(new URL("./backend/pmo-apps-script/shiftcore_roster.js", import.meta.url), "utf8"),
    context
  );

  const result = context.normalizeRoster([
    { userId: "U-DEV", displayName: "開発者", employeeCode: "DEV", role: "developer", workStatus: "on" },
    { userId: "U-1", displayName: "利用者", employeeCode: "001", role: "member", workStatus: "on" }
  ]);

  assert.deepEqual(Array.from(result, (user) => user.userId), ["U-1"]);
});
