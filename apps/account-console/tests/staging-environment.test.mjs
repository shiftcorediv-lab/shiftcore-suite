import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appsRoot = new URL("../../", import.meta.url);
const environmentSource = await readFile(new URL("common/environment.js", appsRoot), "utf8");

function loadEnvironment(search) {
  const storage = new Map();
  const button = { style: {}, addEventListener() {} };
  const document = {
    readyState: "complete",
    body: { prepend() {} },
    documentElement: { dataset: {} },
    getElementById() { return null; },
    createElement() {
      return {
        id: "",
        style: {},
        innerHTML: "",
        setAttribute() {},
        querySelector() { return button; }
      };
    }
  };
  const location = {
    search,
    href: `https://shiftcorediv-lab.github.io/shiftcore-suite/apps/account-console/${search}`,
    origin: "https://shiftcorediv-lab.github.io",
    assign() {}
  };
  const window = {
    location,
    sessionStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  };
  vm.runInNewContext(environmentSource, { window, document, URL, URLSearchParams });
  return window.ShiftCoreEnvironment;
}

test("本番表示は従来URLを維持し、テスト表示だけ専用GASへ切り替える", () => {
  const production = loadEnvironment("");
  assert.equal(production.name, "production");
  assert.equal(production.endpoint("accountApi", "https://production.example/exec"), "https://production.example/exec");

  const staging = loadEnvironment("?shiftcore_env=staging");
  assert.equal(staging.name, "staging");
  for (const key of ["accountApi", "attendanceApi", "ordercaseApi", "pmoApi", "shiftbuilderApi"]) {
    const endpoint = staging.endpoint(key, "https://production.example/exec");
    assert.match(endpoint, /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/);
    assert.notEqual(endpoint, "https://production.example/exec");
  }
  assert.match(staging.withEnvironment("../ordercase/"), /shiftcore_env=staging/);
});

test("主要画面はアプリ設定より前に共通環境判定を読み込む", async () => {
  const pages = [
    "account-console/account-console.html", "account-console/account-portal.html",
    "account-console/attendance-admin.html", "account-console/dashboard.html",
    "account-console/index.html", "account-console/pmo-admin.html",
    "account-console/pmo-portal.html", "account-console/signup-admin.html",
    "account-console/signup-request.html", "account-console/work-report-admin.html",
    "account-console/work-report.html", "ordercase/case.html", "ordercase/cases.html",
    "ordercase/edit.html", "ordercase/index.html", "ordercase/stores.html",
    "pmo/index.html", "shiftbuilder/index.html"
  ];
  for (const page of pages) {
    const source = await readFile(new URL(page, appsRoot), "utf8");
    assert.match(source, /\.\.\/common\/environment\.js\?v=20260830-staging-1/, page);
    const environmentIndex = source.indexOf("../common/environment.js");
    const configIndex = source.search(/(?:js\/config|js\/(?:login|dashboard|account-console|pmo-admin|signup-admin|signup-request)\/config)\.js/);
    if (configIndex >= 0) assert.ok(environmentIndex < configIndex, page);
  }
});

test("非本番GASはstaging明示と専用設定がなければ停止する", async () => {
  const configs = [
    ["account-console/backend/account-apps-script/config.js", "ACCOUNT_SPREADSHEET_ID"],
    ["account-console/backend/attendance-apps-script/Code.gs", "SHIFTCORE_ACCOUNT_API_URL"],
    ["ordercase/backend/ordercase-apps-script/Config.js", "ORDERCASE_SPREADSHEET_ID"],
    ["shiftbuilder/backend/shiftbuilder-apps-script/config.js", "SHIFTBUILDER_SPREADSHEET_ID"],
    ["pmo/backend/pmo-apps-script/config.js", "PMO_SPREADSHEET_ID"]
  ];
  for (const [file, requiredKey] of configs) {
    const source = await readFile(new URL(file, appsRoot), "utf8");
    assert.match(source, /SHIFTCORE_ENVIRONMENT/);
    assert.match(source, /staging/);
    assert.match(source, new RegExp(requiredKey));
    assert.match(source, /必須設定がありません/);
  }
});

test("公開ステージング文書へ個人情報とGoogle管理IDを載せない", async () => {
  const source = await readFile(new URL("STAGING_ENVIRONMENT.md", appsRoot), "utf8");

  assert.doesNotMatch(source, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(source, /drive\.google\.com/i);
  assert.doesNotMatch(source, /AKfy[A-Za-z0-9_-]+/);
  assert.doesNotMatch(source, /`1[A-Za-z0-9_-]{30,}`/);
  assert.match(source, /権限制限された非公開の運用台帳/);
});
