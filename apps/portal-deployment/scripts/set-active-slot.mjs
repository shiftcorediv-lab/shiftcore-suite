import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const targetSlot = String(process.argv[2] || "").trim().toLowerCase();
if (targetSlot !== "blue" && targetSlot !== "green") {
  console.error("Usage: node scripts/set-active-slot.mjs <blue|green>");
  process.exitCode = 1;
} else {
  const deploymentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const configPath = path.join(deploymentDir, "wrangler.router.jsonc");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const currentSlot = String(config.vars?.ACTIVE_SLOT || "");

  if (currentSlot === targetSlot) {
    console.log(`ACTIVE_SLOT is already ${targetSlot}`);
  } else {
    config.vars ??= {};
    config.vars.ACTIVE_SLOT = targetSlot;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    console.log(`ACTIVE_SLOT: ${currentSlot || "unset"} -> ${targetSlot}`);
    console.log("Run npm run check:router, review the diff, then npm run deploy:router.");
  }
}
