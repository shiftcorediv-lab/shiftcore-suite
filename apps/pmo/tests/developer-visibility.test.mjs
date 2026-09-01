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
    readFileSync(new URL("../backend/pmo-apps-script/shiftcore_roster.js", import.meta.url), "utf8"),
    context
  );

  const result = context.normalizeRoster([
    { userId: "U-DEV", displayName: "開発者", employeeCode: "DEV", role: "developer", workStatus: "on" },
    { userId: "U-1", displayName: "利用者", employeeCode: "001", role: "member", workStatus: "on" }
  ]);

  assert.deepEqual(Array.from(result, (user) => user.userId), ["U-1"]);
});

test("PMOからAccount名簿を取得する際は秘密をURLへ出さずPOST bodyで送る", () => {
  let request = null;
  const context = vm.createContext({
    normalizeText: (value) => String(value == null ? "" : value).trim(),
    SETTINGS: {
      SHIFTCORE_ROSTER_API_URL: "https://example.invalid/account",
      EXCLUDED_WORK_STATUSES_FOR_MONTHLY: ["off"]
    },
    PMO_ROSTER_SERVICE_SECRET_PROPERTY: "PMO_ROSTER_SERVICE_SECRET",
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => "service-secret" })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        request = { url, options };
        return {
          getContentText: () => JSON.stringify({
            success: true,
            roster: [{ displayName: "利用者", employeeCode: "001" }]
          })
        };
      }
    },
    console
  });
  vm.runInContext(
    readFileSync(new URL("../backend/pmo-apps-script/shiftcore_roster.js", import.meta.url), "utf8"),
    context
  );

  const roster = context.fetchRosterFromShiftCore_();
  assert.equal(request.url, "https://example.invalid/account");
  assert.equal(request.options.method, "post");
  assert.deepEqual(JSON.parse(request.options.payload), {
    action: "getPmoRosterSecure",
    service_secret: "service-secret"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(roster)), [
    { displayName: "利用者", employeeCode: "001" }
  ]);
});
