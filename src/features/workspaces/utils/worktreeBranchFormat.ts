import type { WorkspaceInfo } from "@/types";

export const DEFAULT_WORKTREE_BRANCH_FORMAT = "trantor/{date}-{random}";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "worktree"
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeWorktreeBranchFormat(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_WORKTREE_BRANCH_FORMAT;
}

export function buildDefaultWorktreeBranch(
  format: string | null | undefined,
  workspace: WorkspaceInfo,
): string {
  const normalized = normalizeWorktreeBranchFormat(format);
  const branch = normalized
    .replace(/\{date\}/g, today())
    .replace(/\{random\}/g, randomSuffix())
    .replace(/\{project\}/g, slugify(workspace.name));
  return branch.trim() || DEFAULT_WORKTREE_BRANCH_FORMAT;
}
