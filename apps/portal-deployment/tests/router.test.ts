import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardRedirect,
  handleRouterRequest,
  normalizeSlot,
  selectSlot,
  standbySlot,
} from "../src/router.ts";

function fetcher(body: string, status = 200): Fetcher {
  return {
    async fetch(input): Promise<Response> {
      const url = input instanceof Request ? input.url : String(input);
      return new Response(`${body}:${new URL(url).pathname}`, { status });
    },
    connect() {
      throw new Error("connect is not used");
    },
  } satisfies Fetcher;
}

function failingFetcher(message: string): Fetcher {
  return {
    async fetch(): Promise<Response> {
      throw new Error(message);
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

test("each active slot has the other slot as its standby", () => {
  assert.equal(standbySlot("blue"), "green");
  assert.equal(standbySlot("green"), "blue");
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

test("a failing active Blue slot automatically falls back to Red", async () => {
  const response = await handleRouterRequest(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/apps/account-console/",
    ),
    {
      ACTIVE_SLOT: "blue",
      BLUE: failingFetcher("blue unavailable"),
      GREEN: fetcher("red"),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "red:/apps/account-console/");
  assert.equal(response.headers.get("X-Another-Portal-Active-Slot"), "green");
  assert.equal(response.headers.get("X-Another-Portal-Failover"), "blue-to-green");
});

test("a 5xx active Red slot automatically falls back to Blue", async () => {
  const response = await handleRouterRequest(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/apps/ordercase/",
    ),
    {
      ACTIVE_SLOT: "green",
      BLUE: fetcher("blue"),
      GREEN: fetcher("red unavailable", 503),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "blue:/apps/ordercase/");
  assert.equal(response.headers.get("X-Another-Portal-Active-Slot"), "blue");
  assert.equal(response.headers.get("X-Another-Portal-Failover"), "green-to-blue");
});

test("maintenance response appears only when both slots are unavailable", async () => {
  const response = await handleRouterRequest(
    new Request(
      "https://another-portal-router.shiftcore-div.workers.dev/apps/account-console/",
    ),
    {
      ACTIVE_SLOT: "blue",
      BLUE: failingFetcher("blue unavailable"),
      GREEN: fetcher("red unavailable", 503),
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
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
