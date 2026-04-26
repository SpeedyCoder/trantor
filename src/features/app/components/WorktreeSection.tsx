import type { MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";
import { WorktreeCard } from "./WorktreeCard";

type WorktreeSectionProps = {
  worktrees: WorkspaceInfo[];
  deletingWorktreeIds: Set<string>;
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  className?: string;
};

export function WorktreeSection({
  worktrees,
  deletingWorktreeIds,
  activeWorkspaceId,
  onSelectWorkspace,
  onConnectWorkspace,
  onShowWorktreeMenu,
  className,
}: WorktreeSectionProps) {
  if (!worktrees.length) {
    return null;
  }

  return (
    <div className={`worktree-section${className ? ` ${className}` : ""}`}>
      <div className="worktree-list">
        {worktrees.map((worktree) => (
          <WorktreeCard
            key={worktree.id}
            worktree={worktree}
            isActive={worktree.id === activeWorkspaceId}
            isDeleting={deletingWorktreeIds.has(worktree.id)}
            onSelectWorkspace={onSelectWorkspace}
            onShowWorktreeMenu={onShowWorktreeMenu}
            onConnectWorkspace={onConnectWorkspace}
          />
        ))}
      </div>
    </div>
  );
}
