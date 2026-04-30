import type { MouseEvent } from "react";

import {
  DEFAULT_WORKTREE_BRANCH_FORMAT,
  normalizeWorktreeBranchFormat,
} from "@/features/workspaces/utils/worktreeBranchFormat";
import type { WorkspaceInfo } from "../../../types";

function getWorktreeBranchPrefix(format: string | null | undefined): string {
  const normalized = normalizeWorktreeBranchFormat(format);
  const firstPlaceholderIndex = normalized.indexOf("{");
  return firstPlaceholderIndex >= 0 ? normalized.slice(0, firstPlaceholderIndex) : "";
}

function sanitizeWorktreePrefix(prefix: string): string {
  return prefix.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/-+$/g, "-");
}

function formatSidebarWorktreeLabel(
  value: string,
  defaultWorktreeBranchFormat: string | null | undefined,
): string {
  const trimmed = value.trim();
  const defaultWorktreeBranchPrefix =
    getWorktreeBranchPrefix(defaultWorktreeBranchFormat) ||
    getWorktreeBranchPrefix(DEFAULT_WORKTREE_BRANCH_FORMAT);
  const prefixCandidates = Array.from(
    new Set([
      defaultWorktreeBranchPrefix,
      sanitizeWorktreePrefix(defaultWorktreeBranchPrefix),
    ]),
  ).filter(Boolean);
  const withoutDefaultPrefix =
    prefixCandidates.find((prefix) => trimmed.startsWith(prefix)) ?? null;
  const labelBase = withoutDefaultPrefix
    ? trimmed.slice(withoutDefaultPrefix.length)
    : trimmed;
  return labelBase.split("-").filter(Boolean).join(" ").trim() || trimmed;
}

type WorktreeCardProps = {
  worktree: WorkspaceInfo;
  isActive: boolean;
  isDeleting?: boolean;
  defaultWorktreeBranchFormat: string;
  hasActiveAgent?: boolean;
  onSelectWorkspace: (id: string) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
};

export function WorktreeCard({
  worktree,
  isActive,
  isDeleting = false,
  defaultWorktreeBranchFormat,
  hasActiveAgent = false,
  onSelectWorkspace,
  onShowWorktreeMenu,
  onConnectWorkspace,
}: WorktreeCardProps) {
  const worktreeBranch = worktree.worktree?.branch ?? "";
  const rawWorktreeLabel = worktree.name?.trim() || worktreeBranch;
  const worktreeLabel = formatSidebarWorktreeLabel(
    rawWorktreeLabel,
    defaultWorktreeBranchFormat,
  );
  const worktreeMeta =
    worktreeBranch && worktreeBranch !== rawWorktreeLabel ? worktreeBranch : null;

  return (
    <div className={`worktree-card${isDeleting ? " deleting" : ""}`}>
      <div
        className={`worktree-row ${isActive ? "active" : ""}${isDeleting ? " deleting" : ""}`}
        role="button"
        tabIndex={isDeleting ? -1 : 0}
        aria-disabled={isDeleting}
        onClick={() => {
          if (!isDeleting) {
            onSelectWorkspace(worktree.id);
          }
        }}
        onContextMenu={(event) => {
          if (!isDeleting) {
            onShowWorktreeMenu(event, worktree);
          }
        }}
        onKeyDown={(event) => {
          if (isDeleting) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectWorkspace(worktree.id);
          }
        }}
      >
        <div className="worktree-copy">
          <div className="worktree-label-row">
            <span
              className={`workspace-activity-indicator${hasActiveAgent ? " is-active" : ""}`}
              aria-label={hasActiveAgent ? "Agent running in worktree" : undefined}
              aria-hidden={hasActiveAgent ? undefined : true}
              role={hasActiveAgent ? "status" : undefined}
            />
            <div className="worktree-label">{worktreeLabel}</div>
          </div>
          {worktreeMeta ? <div className="worktree-meta">{worktreeMeta}</div> : null}
        </div>
        <div className="worktree-actions">
          {isDeleting ? (
            <div className="worktree-deleting" role="status" aria-live="polite">
              <span className="worktree-deleting-spinner" aria-hidden />
              <span className="worktree-deleting-label">Deleting</span>
            </div>
          ) : !worktree.connected ? (
            <span
              className="connect"
              title="Connect project context to the shared Codex server"
              onClick={(event) => {
                event.stopPropagation();
                onConnectWorkspace(worktree);
              }}
            >
              connect
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
