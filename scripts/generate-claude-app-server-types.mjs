import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const outDir = path.join(
  repoRoot,
  "packages",
  "claude-app-server-adapter",
  "src",
  "generated",
);

const result = spawnSync(
  "codex",
  ["app-server", "generate-ts", "--experimental", "--out", outDir],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  },
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
