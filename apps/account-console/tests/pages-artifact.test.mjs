import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../../../", import.meta.url);
const buildScript = new URL("../../scripts/build-pages-site.sh", import.meta.url);

test("Pages成果物は公開許可した静的フロントだけを含む", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "shiftcore-pages-"));
  const destination = join(temporaryRoot, "site");

  try {
    const result = spawnSync("bash", [buildScript.pathname, destination], {
      cwd: repoRoot.pathname,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    await access(join(destination, "index.html"));
    await access(join(destination, "apps/account-console/index.html"));
    await access(join(destination, "apps/ordercase/index.html"));
    await access(join(destination, "apps/shiftbuilder/index.html"));
    await access(join(destination, "apps/pmo/index.html"));
    await access(join(destination, "shared/js/shiftcore-auth.js"));

    const forbiddenPaths = [
      "apps/STAGING_ENVIRONMENT.md",
      "apps/AI_COLLABORATION_HANDOFF.md",
      "apps/ai-handoff",
      "apps/account-console/backend",
      "apps/account-console/tests",
      "apps/ordercase/backend",
      "apps/shiftbuilder/backend",
      "apps/another-portal"
    ];

    for (const path of forbiddenPaths) {
      await assert.rejects(access(join(destination, path)), undefined, path);
    }

    const rootHtml = await readFile(join(destination, "index.html"), "utf8");
    assert.doesNotMatch(rootHtml, /STAGING_ENVIRONMENT|Apps Script ID|Spreadsheet ID/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
