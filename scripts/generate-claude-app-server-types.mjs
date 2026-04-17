import { rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const outDir = path.join(
  repoRoot,
  "packages",
  "claude-app-server-adapter",
  "generated",
  "app-server",
);

rmSync(outDir, { recursive: true, force: true });

const codexJs = process.env.CODEX_JS?.trim();
const args = ["app-server", "generate-ts", "--out", outDir];
const command = codexJs ? process.execPath : "codex";
const commandArgs = codexJs ? [codexJs, ...args] : args;

const result = spawnSync(command, commandArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
