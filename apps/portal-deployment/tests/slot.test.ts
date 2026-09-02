import assert from "node:assert/strict";
import test from "node:test";

import { handleSlotRequest } from "../src/slot.ts";

test("slot worker serves assets and identifies the slot", async () => {
  const assets = {
    async fetch(): Promise<Response> {
      return new Response("asset", { headers: { ETag: "test" } });
    },
    connect(): never {
      throw new Error("connect is not used");
    },
  } satisfies Fetcher;
  const env: SlotEnv = { PORTAL_SLOT: "green", ASSETS: assets };
  const response = await handleSlotRequest(
    new Request("https://assets.local/apps/account-console/"),
    env,
  );
  assert.equal(await response?.text(), "asset");
  assert.equal(response?.headers.get("ETag"), "test");
  assert.equal(response?.headers.get("X-Another-Portal-Slot"), "green");
});
