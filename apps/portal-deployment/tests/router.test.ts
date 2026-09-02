import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardRedirect,
  handleRouterRequest,
  inactiveSlot,
  normalizeSlot,
  selectSlot,
} from "../src/router.ts";

function fetcher(body: string): Fetcher {
  return {
    async fetch(input): Promise<Response> {
      const url = input instanceof Request ? input.url : String(input);
      return new Response(`${body}:${new URL(url).pathname}`);
    },
    connect() {
      throw new Error("connect is not used");
    },
  } satisfies Fetcher;
}

function env(activeSlot = "blue"): RouterEnv {
  return {
    ACTIVE_SLOT: activeSlot,
    PRODUCTION_HOST: "portal.another-inc.jp",
    PREVIEW_HOST: "preview.portal.another-inc.jp",
    BLUE: fetcher("blue"),
    GREEN: fetcher("green"),
  };
}

test("slot values fail closed", () => {
  assert.equal(normalizeSlot("blue"), "blue");
  assert.equal(normalizeSlot("green"), "green");
  assert.equal(normalizeSlot("other"), null);
});

test("preview always points to the inactive slot", () => {
  assert.equal(inactiveSlot("blue"), "green");
  assert.equal(selectSlot("portal.another-inc.jp", env("blue")), "blue");
  assert.equal(selectSlot("preview.portal.another-inc.jp", env("blue")), "green");
  assert.equal(selectSlot("preview.portal.another-inc.jp", env("green")), "blue");
});

test("root redirects to the account console and preserves the query", () => {
  const response = dashboardRedirect(new Request("https://portal.another-inc.jp/?shiftcore_env=staging"));
  assert.equal(response?.status, 302);
  assert.equal(
    response?.headers.get("location"),
    "https://portal.another-inc.jp/apps/account-console/?shiftcore_env=staging",
  );
});

test("production and preview requests use different slots", async () => {
  const production = await handleRouterRequest(
    new Request("https://portal.another-inc.jp/apps/account-console/dashboard.html"),
    env("blue"),
  );
  const preview = await handleRouterRequest(
    new Request("https://preview.portal.another-inc.jp/apps/account-console/dashboard.html"),
    env("blue"),
  );

  assert.equal(await production?.text(), "blue:/apps/account-console/dashboard.html");
  assert.equal(production?.headers.get("X-Another-Portal-Active-Slot"), "blue");
  assert.equal(await preview?.text(), "green:/apps/account-console/dashboard.html");
  assert.equal(preview?.headers.get("X-Another-Portal-Preview"), "inactive-slot");
  assert.equal(preview?.headers.get("X-Robots-Tag"), "noindex, noarchive");
});

test("invalid active slot returns a maintenance response", async () => {
  const response = await handleRouterRequest(
    new Request("https://portal.another-inc.jp/apps/account-console/"),
    env("invalid"),
  );
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get("Cache-Control"), "no-store");
});

test("write methods are rejected by the static router", async () => {
  const response = await handleRouterRequest(
    new Request("https://portal.another-inc.jp/apps/account-console/", { method: "POST" }),
    env(),
  );
  assert.equal(response?.status, 405);
});
