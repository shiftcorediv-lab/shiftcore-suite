import { execFile } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const deploymentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appsDir = path.resolve(deploymentDir, "..");
const repositoryDir = path.resolve(appsDir, "..");
const distDir = path.join(deploymentDir, "dist");

const appDirectories = [
  "account-console",
  "common",
  "ordercase",
  "persona-gacha",
  "pmo",
  "shiftbuilder",
  "theme",
];

const excludedDirectoryNames = new Set([
  "backend",
  "docs",
  "node_modules",
  "tests",
]);
const excludedFileNames = new Set([
  ".DS_Store",
  ".gitkeep",
  "AGENTS.md",
  "CLAUDE.md",
]);

function shouldCopy(source) {
  const relative = path.relative(repositoryDir, source);
  const segments = relative.split(path.sep);
  const name = path.basename(source);
  if (segments.some((segment) => excludedDirectoryNames.has(segment))) return false;
  if (excludedFileNames.has(name)) return false;
  return !name.endsWith(".md");
}

async function copyDirectory(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: shouldCopy,
  });
}

async function gitValue(args, fallback) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: repositoryDir });
    return stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "apps"), { recursive: true });

for (const appDirectory of appDirectories) {
  await copyDirectory(
    path.join(appsDir, appDirectory),
    path.join(distDir, "apps", appDirectory),
  );
}
await copyDirectory(path.join(repositoryDir, "shared"), path.join(distDir, "shared"));

const commit = await gitValue(["rev-parse", "HEAD"], "unknown");
const version = await gitValue(["describe", "--tags", "--always", "--dirty"], commit.slice(0, 12));
const builtAt = new Date().toISOString();

await writeFile(
  path.join(distDir, "release.json"),
  `${JSON.stringify({ product: "Another Portal", version, commit, built_at: builtAt }, null, 2)}\n`,
  "utf8",
);

await writeFile(
  path.join(distDir, "404.html"),
  "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>ページが見つかりません</title><body><main><h1>ページが見つかりません</h1><p><a href=\"/apps/account-console/\">Another Portalへ戻る</a></p></main></body></html>\n",
  "utf8",
);

console.log(JSON.stringify({ dist: distDir, version, commit, built_at: builtAt }));
