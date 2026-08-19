import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("PMO名簿APIは開発者を返さない", () => {
  const context = vm.createContext({
    getUsersData: () => [
      { internal_user_id: "U-DEV", name: "開発者", employee_code: "DEV", role: "developer" },
      { internal_user_id: "U-1", name: "利用者", employee_code: "001", role: "member" }
    ],
    getNormalizedWorkStatus: () => "on"
  });
  vm.runInContext(
    readFileSync(new URL("../backend/account-apps-script/pmo_roster.js", import.meta.url), "utf8"),
    context
  );

  const result = context.getPmoRoster();
  assert.equal(result.success, true);
  assert.deepEqual(
    Array.from(result.roster, (user) => user.userId),
    ["U-1"]
  );
});
