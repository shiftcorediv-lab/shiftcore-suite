import assert from "node:assert/strict";
import test from "node:test";
import { buildPortalEntryUrl } from "../js/dashboard/portal-navigation.js";

test("設定済みHTTPS URLへ出勤経路だけを追加する", () => {
  const result = buildPortalEntryUrl({
    entry_url: "https://portal.example.com/office?theme=warm",
    event_id: "evt_001",
    sync: "queued"
  });
  const url = new URL(result);

  assert.equal(url.origin, "https://portal.example.com");
  assert.equal(url.pathname, "/office");
  assert.equal(url.searchParams.get("theme"), "warm");
  assert.equal(url.searchParams.get("from"), "ap");
  assert.equal(url.searchParams.get("entry"), "clock-in");
  assert.equal(url.searchParams.has("event_id"), false);
  assert.equal(url.searchParams.has("email"), false);
  assert.equal(url.searchParams.has("idToken"), false);
});

test("HTTP・認証情報付き・不正URLを拒否する", () => {
  assert.equal(buildPortalEntryUrl({ entry_url: "http://portal.example.com" }), "");
  assert.equal(buildPortalEntryUrl({ entry_url: "https://user:pass@portal.example.com" }), "");
  assert.equal(buildPortalEntryUrl({ entry_url: "not a url" }), "");
  assert.equal(buildPortalEntryUrl(null), "");
});
