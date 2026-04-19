import {
  cpSync,
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

function toImportPath(relativePath) {
  return `./${relativePath.replace(/\.ts$/, "").split(path.sep).join("/")}`;
}

function toImportAlias(relativePath) {
  return relativePath
    .replace(/\.ts$/, "")
    .split(path.sep)
    .join("_")
    .replace(/[^A-Za-z0-9_]/g, "_");
}

function writeUnionFile(typeName, suffix, relativeFiles) {
  const matches = relativeFiles
    .filter((file) => path.basename(file, ".ts").endsWith(suffix))
    .sort();

  const lines = ["// GENERATED CODE! DO NOT MODIFY BY HAND!", ""];

  for (const relativePath of matches) {
    const symbol = path.basename(relativePath, ".ts");
    const alias = toImportAlias(relativePath);
    lines.push(
      `import type { ${symbol} as ${alias} } from "${toImportPath(relativePath)}";`,
    );
  }

  if (matches.length > 0) {
    lines.push("", `export type ${typeName} =`);
    lines.push(...matches.map((relativePath) => `  | ${toImportAlias(relativePath)}`));
    lines.push(";");
  } else {
    lines.push("", `export type ${typeName} = never;`);
  }
  lines.push("");

  writeFileSync(path.join(outDir, `${typeName}.ts`), lines.join("\n"));
}

function updateRootIndex() {
  const indexPath = path.join(outDir, "index.ts");
  const exportsToAppend = [
    'export type { JsonRpcParams } from "./JsonRpcParams";',
    'export type { JsonRpcResponse } from "./JsonRpcResponse";',
  ];
  const current = readFileSync(indexPath, "utf8");
  const next = exportsToAppend.reduce((content, line) => {
    return content.includes(line) ? content : `${content.trimEnd()}\n${line}\n`;
  }, current);
  writeFileSync(indexPath, next);
}

function copyGeneratedTree() {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(tempDir, outDir, { recursive: true });

  const relativeFiles = listTsFiles(outDir)
    .map((file) => path.relative(outDir, file))
    .filter((file) => file !== "index.ts")
    .filter((file) => file !== "JsonRpcParams.ts")
    .filter((file) => file !== "JsonRpcResponse.ts")
    .sort();

  writeUnionFile("JsonRpcParams", "Params", relativeFiles);
  writeUnionFile("JsonRpcResponse", "Response", relativeFiles);
  updateRootIndex();
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
    copyGeneratedTree();
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
