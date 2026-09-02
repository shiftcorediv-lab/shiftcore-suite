import assert from "node:assert/strict";
import test from "node:test";

import { buildCorsHeaders } from "./worker.js";

test("allows the existing GitHub Pages portal", () => {
  const headers = buildCorsHeaders(new Request("https://worker.test/", {
    headers: { Origin: "https://shiftcorediv-lab.github.io" }
  }));

  assert.equal(
    headers["Access-Control-Allow-Origin"],
    "https://shiftcorediv-lab.github.io"
  );
  assert.equal(headers.Vary, "Origin");
});

test("allows the Another Portal preview router", () => {
  const headers = buildCorsHeaders(new Request("https://worker.test/", {
    headers: { Origin: "https://another-portal-router.shiftcore-div.workers.dev" }
  }));

  assert.equal(
    headers["Access-Control-Allow-Origin"],
    "https://another-portal-router.shiftcore-div.workers.dev"
  );
});

test("does not authorize an unknown origin", () => {
  const headers = buildCorsHeaders(new Request("https://worker.test/", {
    headers: { Origin: "https://example.invalid" }
  }));

  assert.equal(headers["Access-Control-Allow-Origin"], undefined);
  assert.equal(headers.Vary, "Origin");
});
