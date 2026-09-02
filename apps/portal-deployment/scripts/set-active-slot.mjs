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
  const configSource = await readFile(configPath, "utf8");
  const activeSlotPattern = /(\"ACTIVE_SLOT\"\s*:\s*\")(blue|green)(\")/;
  const currentSlot = configSource.match(activeSlotPattern)?.[2] || "";

  if (!currentSlot) {
    throw new Error("ACTIVE_SLOT must exist and be either blue or green");
  }

  if (currentSlot === targetSlot) {
    console.log(`ACTIVE_SLOT is already ${targetSlot}`);
  } else {
    const updatedConfig = configSource.replace(
      activeSlotPattern,
      `$1${targetSlot}$3`,
    );
    await writeFile(configPath, updatedConfig, "utf8");
    console.log(`ACTIVE_SLOT: ${currentSlot || "unset"} -> ${targetSlot}`);
    console.log("Run npm run check:router, review the diff, then npm run deploy:router.");
  }
}
