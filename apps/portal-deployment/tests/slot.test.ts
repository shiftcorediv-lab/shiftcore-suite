import assert from "node:assert/strict";
import test from "node:test";

import { handleSlotRequest, maintenanceResponse } from "../src/slot.ts";

function assets(body = "asset"): Fetcher {
  return {
    async fetch(): Promise<Response> {
      return new Response(body, { headers: { ETag: "test" } });
    },
    connect(): never {
      throw new Error("connect is not used");
    },
  } satisfies Fetcher;
}

test("blue slot serves assets and identifies the slot", async () => {
  const env: SlotEnv = { PORTAL_SLOT: "blue", ASSETS: assets() };
  const response = await handleSlotRequest(
    new Request("https://assets.local/apps/account-console/"),
    env,
  );
  assert.equal(await response?.text(), "asset");
  assert.equal(response?.headers.get("ETag"), "test");
  assert.equal(response?.headers.get("X-Another-Portal-Slot"), "blue");
});

test("green slot serves the branded maintenance page without reading assets", async () => {
  let assetFetches = 0;
  const unavailableAssets = {
    async fetch(): Promise<Response> {
      assetFetches += 1;
      return new Response("must not be served");
    },
    connect(): never {
      throw new Error("connect is not used");
    },
  } satisfies Fetcher;
  const env: SlotEnv = { PORTAL_SLOT: "green", ASSETS: unavailableAssets };
  const response = await handleSlotRequest(
    new Request("https://assets.local/apps/ordercase/"),
    env,
  );
  const html = await response.text();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Another-Portal-Slot"), "green");
  assert.equal(assetFetches, 0);
  assert.match(html, /Another Portal/);
  assert.match(html, /メンテナンス中/);
  assert.match(html, /--blue:#1556b8/);
  assert.match(html, /--red:#d93440/);
  assert.doesNotMatch(html, /blue slot|green slot/i);
});

test("maintenance HEAD response has no body", async () => {
  const response = maintenanceResponse(
    new Request("https://assets.local/", { method: "HEAD" }),
  );

  assert.equal(response.status, 503);
  assert.equal(await response.text(), "");
});
