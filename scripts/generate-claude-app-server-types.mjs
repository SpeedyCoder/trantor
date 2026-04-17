import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
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
const tempDir = mkdtempSync(path.join(os.tmpdir(), "claude-app-server-types-"));

function listTsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTsFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

function normalizeImportTarget(fromFile, specifier) {
  return path.normalize(path.resolve(path.dirname(fromFile), `${specifier}.ts`));
}

function collectDependencies(entryFiles) {
  const keep = new Set();
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || keep.has(current)) {
      continue;
    }
    keep.add(current);

    const content = readFileSync(current, "utf8");
    const importMatches = content.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g);
    for (const match of importMatches) {
      const target = normalizeImportTarget(current, match[1]);
      if (!keep.has(target)) {
        queue.push(target);
      }
    }
  }

  return keep;
}

function writeFilteredIndex(keptFiles) {
  const relativeFiles = [...keptFiles]
    .map((file) => path.relative(tempDir, file))
    .filter((file) => !file.startsWith(`v2${path.sep}`))
    .filter((file) => !file.startsWith(`serde_json${path.sep}`))
    .filter((file) => file !== "index.ts")
    .sort();

  const lines = [
    "// GENERATED CODE! DO NOT MODIFY BY HAND!",
    "",
    ...relativeFiles.map((file) => {
      const exportPath = `./${file.replace(/\.ts$/, "").split(path.sep).join("/")}`;
      const symbol = path.basename(file, ".ts");
      return `export type { ${symbol} } from "${exportPath}";`;
    }),
    'export * as v2 from "./v2";',
    "",
  ];

  writeFileSync(path.join(outDir, "index.ts"), lines.join("\n"));
}

function copyRetainedFiles(keptFiles) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const sourceFile of keptFiles) {
    const relativePath = path.relative(tempDir, sourceFile);
    const destination = path.join(outDir, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(sourceFile, destination);
  }

  writeFilteredIndex(keptFiles);
}

function addOptionalRootEntries(files) {
  const next = [...files];
  for (const relativePath of [
    "ClientRequest.ts",
    "ServerNotification.ts",
    "ServerRequest.ts",
    "RequestId.ts",
    "InitializeParams.ts",
    "InitializeResponse.ts",
    "ClientInfo.ts",
    "InitializeCapabilities.ts",
  ]) {
    const fullPath = path.join(tempDir, relativePath);
    try {
      readFileSync(fullPath, "utf8");
      next.push(fullPath);
    } catch {
      // Ignore missing optional files.
    }
  }
  return next;
}

const codexJs = process.env.CODEX_JS?.trim();
const args = ["app-server", "generate-ts", "--out", tempDir];
const command = codexJs ? process.execPath : "codex";
const commandArgs = codexJs ? [codexJs, ...args] : args;

const result = spawnSync(command, commandArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

if (typeof result.status === "number") {
  if (result.status === 0) {
    const entryFiles = addOptionalRootEntries(listTsFiles(path.join(tempDir, "v2")));
    const keptFiles = collectDependencies(entryFiles);
    copyRetainedFiles(keptFiles);
    rmSync(tempDir, { recursive: true, force: true });
  } else {
    rmSync(tempDir, { recursive: true, force: true });
  }
  process.exit(result.status);
}

if (result.error) {
  rmSync(tempDir, { recursive: true, force: true });
  throw result.error;
}

rmSync(tempDir, { recursive: true, force: true });
process.exit(1);
