import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardRedirect,
  handleRouterRequest,
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
    BLUE: fetcher("blue"),
    GREEN: fetcher("green"),
  };
}

test("slot values fail closed", () => {
  assert.equal(normalizeSlot("blue"), "blue");
  assert.equal(normalizeSlot("green"), "green");
  assert.equal(normalizeSlot("other"), null);
});

test("router selects only the configured active slot", () => {
  assert.equal(selectSlot(env("blue")), "blue");
  assert.equal(selectSlot(env("green")), "green");
});

test("root redirects to the account console and preserves the query", () => {
  const response = dashboardRedirect(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/?shiftcore_env=staging",
    ),
  );
  assert.equal(response?.status, 302);
  assert.equal(
    response?.headers.get("location"),
    "https://another-portal-router.shiftcore-div.workers.dev/apps/account-console/?shiftcore_env=staging",
  );
});

test("requests use the active slot", async () => {
  const blue = await handleRouterRequest(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/apps/account-console/dashboard.html",
    ),
    env("blue"),
  );
  const green = await handleRouterRequest(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/apps/account-console/dashboard.html",
    ),
    env("green"),
  );

  assert.equal(await blue?.text(), "blue:/apps/account-console/dashboard.html");
  assert.equal(blue?.headers.get("X-Another-Portal-Active-Slot"), "blue");
  assert.equal(await green?.text(), "green:/apps/account-console/dashboard.html");
  assert.equal(green?.headers.get("X-Another-Portal-Active-Slot"), "green");
});

test("invalid active slot returns a maintenance response", async () => {
  const response = await handleRouterRequest(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/apps/account-console/",
    ),
    env("invalid"),
  );
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get("Cache-Control"), "no-store");
});

test("write methods are rejected by the static router", async () => {
  const response = await handleRouterRequest(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/apps/account-console/",
      { method: "POST" },
    ),
    env(),
  );
  assert.equal(response?.status, 405);
});
