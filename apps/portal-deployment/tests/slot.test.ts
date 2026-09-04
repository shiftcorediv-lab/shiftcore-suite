import assert from "node:assert/strict";
import test from "node:test";

import { handleSlotRequest, portalColor } from "../src/slot.ts";

function assets(body = "asset"): Fetcher {
  return {
    async fetch(): Promise<Response> {
      return new Response(body, {
        headers: {
          "Content-Type": "text/plain",
          ETag: "test",
        },
      });
    },
    connect(): never {
      throw new Error("connect is not used");
    },
  } satisfies Fetcher;
}

test("blue slot serves the full portal with the blue presentation", async () => {
  const env: SlotEnv = { PORTAL_SLOT: "blue", ASSETS: assets() };
  const response = await handleSlotRequest(
    new Request("https://assets.local/apps/account-console/"),
    env,
  );
  assert.equal(await response.text(), "asset");
  assert.equal(response.headers.get("ETag"), "test");
  assert.equal(response.headers.get("X-Another-Portal-Slot"), "blue");
  assert.equal(response.headers.get("X-Another-Portal-Color"), "blue");
});

test("green internal slot serves the full portal with the red presentation", async () => {
  let assetFetches = 0;
  const trackedAssets = {
    async fetch(): Promise<Response> {
      assetFetches += 1;
      return new Response("red portal", {
        headers: { "Content-Type": "text/plain" },
      });
    },
    connect(): never {
      throw new Error("connect is not used");
    },
  } satisfies Fetcher;
  const env: SlotEnv = { PORTAL_SLOT: "green", ASSETS: trackedAssets };
  const response = await handleSlotRequest(
    new Request("https://assets.local/apps/ordercase/"),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "red portal");
  assert.equal(response.headers.get("X-Another-Portal-Slot"), "green");
  assert.equal(response.headers.get("X-Another-Portal-Color"), "red");
  assert.equal(assetFetches, 1);
});

test("public colors remain stable even though Red uses the internal green name", () => {
  assert.equal(portalColor("blue"), "blue");
  assert.equal(portalColor("green"), "red");
});
