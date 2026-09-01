import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("PMO名簿APIはサービス認証を必須にし開発者を除外して最小項目だけ返す", () => {
  const context = vm.createContext({
    getUsersData: () => [
      { internal_user_id: "U-DEV", name: "開発者", employee_code: "DEV", role: "developer", status: "active" },
      { internal_user_id: "U-STOP", name: "停止中", employee_code: "002", role: "member", status: "stopped" },
      { internal_user_id: "U-1", name: "利用者", employee_code: "001", role: "member", status: "active" }
    ],
    getNormalizedWorkStatus: () => "on",
    normalizeText: (value) => String(value == null ? "" : value).trim(),
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => key === "PMO_ROSTER_SERVICE_SECRET" ? "service-secret" : ""
      })
    },
    PMO_ROSTER_SERVICE_SECRET_PROPERTY: "PMO_ROSTER_SERVICE_SECRET"
  });
  vm.runInContext(
    readFileSync(new URL("../backend/account-apps-script/pmo_roster.js", import.meta.url), "utf8"),
    context
  );

  assert.throws(() => context.getPmoRosterSecure(""), /SERVICE_AUTH_INVALID/);
  assert.throws(() => context.getPmoRosterSecure("wrong-secret"), /SERVICE_AUTH_INVALID/);

  const result = context.getPmoRosterSecure("service-secret");
  assert.equal(result.success, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.roster)),
    [{ displayName: "利用者", employeeCode: "001" }]
  );
});

test("Account公開入口は匿名GET名簿を廃止しサービス認証付きPOSTだけを残す", () => {
  const source = readFileSync(new URL("../backend/account-apps-script/api.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /action === "getPmoRoster"/);
  assert.match(source, /action === "getPmoRosterSecure"/);
  assert.match(source, /body\.service_secret/);
});
