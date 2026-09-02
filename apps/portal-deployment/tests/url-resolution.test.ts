import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sharedUrlsPath = new URL("../../../shared/js/shiftcore-urls.js", import.meta.url);
const orderConfigPath = new URL("../../ordercase/js/config.js", import.meta.url);

async function loadUrls(pathname: string, origin: string) {
  const source = await readFile(sharedUrlsPath, "utf8");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Reflect.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { pathname, origin } },
  });

  try {
    return await import(`data:text/javascript,${encodeURIComponent(source)}#${crypto.randomUUID()}`);
  } finally {
    if (previousWindow) {
      Reflect.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

test("suite URLs retain the GitHub Pages repository prefix", async () => {
  const urls = await loadUrls(
    "/shiftcore-suite/apps/account-console/dashboard.html",
    "https://shiftcorediv-lab.github.io",
  );
  assert.equal(
    urls.APP_URLS.ordercase,
    "https://shiftcorediv-lab.github.io/shiftcore-suite/apps/ordercase/",
  );
});

test("suite URLs use the stable portal origin without a repository prefix", async () => {
  const urls = await loadUrls(
    "/apps/account-console/dashboard.html",
    "https://another-portal-router.shiftcore-div.workers.dev",
  );
  assert.equal(
    urls.APP_URLS.shiftbuilder,
    "https://another-portal-router.shiftcore-div.workers.dev/apps/shiftbuilder/",
  );
});

test("Order login returns to the same deployed portal", async () => {
  const source = await readFile(orderConfigPath, "utf8");
  assert.match(source, /withEnvironment\('\.\.\/account-console\/'\)/);
  assert.doesNotMatch(source, /shiftcore-account-front/);
});
