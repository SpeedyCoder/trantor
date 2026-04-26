import Layers from "lucide-react/dist/esm/icons/layers";
import type { MouseEvent, ReactNode } from "react";

import type { WorkspaceInfo } from "../../../types";
import { WorktreeCard } from "./WorktreeCard";

type WorktreeSectionProps = {
  worktrees: WorkspaceInfo[];
  deletingWorktreeIds: Set<string>;
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  sectionLabel?: string;
  sectionIcon?: ReactNode;
  className?: string;
};

export function WorktreeSection({
  worktrees,
  deletingWorktreeIds,
  activeWorkspaceId,
  onSelectWorkspace,
  onConnectWorkspace,
  onShowWorktreeMenu,
  sectionLabel = "Worktrees",
  sectionIcon,
  className,
}: WorktreeSectionProps) {
  if (!worktrees.length) {
    return null;
  }

  return (
    <div className={`worktree-section${className ? ` ${className}` : ""}`}>
      <div className="worktree-header">
        <span className="worktree-header-title">
          <span className="worktree-header-icon-wrap">
            {sectionIcon ?? <Layers className="worktree-header-icon" aria-hidden />}
          </span>
          <span>{sectionLabel}</span>
        </span>
        <span className="worktree-header-count">{worktrees.length}</span>
      </div>
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
