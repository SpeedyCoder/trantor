import type { MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorktreeSection } from "./WorktreeSection";
import type { WorkspaceGroupSection } from "./sidebarTypes";

type SidebarWorkspaceGroupsProps = {
  groups: WorkspaceGroupSection[];
  worktreesByParent: Map<string, WorkspaceInfo[]>;
  deletingWorktreeIds: Set<string>;
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onShowWorkspaceMenu: (event: MouseEvent, workspaceId: string) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
};

type SidebarWorkspaceEntryProps = Omit<
  SidebarWorkspaceGroupsProps,
  "groups"
> & {
  workspace: WorkspaceInfo;
};

function SidebarWorkspaceEntry({
  workspace,
  worktreesByParent,
  deletingWorktreeIds,
  activeWorkspaceId,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddWorktreeAgent,
  onToggleWorkspaceCollapse,
  onShowWorkspaceMenu,
  onShowWorktreeMenu,
}: SidebarWorkspaceEntryProps) {
  const isCollapsed = workspace.settings.sidebarCollapsed;
  const worktrees = worktreesByParent.get(workspace.id) ?? [];

  return (
    <WorkspaceCard
      workspace={workspace}
      workspaceName={workspace.name}
      isCollapsed={isCollapsed}
      onShowWorkspaceMenu={onShowWorkspaceMenu}
      onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
      onConnectWorkspace={onConnectWorkspace}
      onAddWorktreeAgent={onAddWorktreeAgent}
    >
      {worktrees.length > 0 ? (
        <WorktreeSection
          worktrees={worktrees}
          deletingWorktreeIds={deletingWorktreeIds}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onConnectWorkspace={onConnectWorkspace}
          onShowWorktreeMenu={onShowWorktreeMenu}
        />
      ) : (
        <div className="empty">No worktrees yet.</div>
      )}
    </WorkspaceCard>
  );
}

export function SidebarWorkspaceGroups({
  groups,
  ...entryProps
}: SidebarWorkspaceGroupsProps) {
  const visibleWorkspaces = groups.flatMap((group) =>
    group.workspaces.filter((workspace) => (workspace.kind ?? "main") === "main"),
  );

  return (
    <>
      {visibleWorkspaces.map((workspace) => (
        <SidebarWorkspaceEntry key={workspace.id} workspace={workspace} {...entryProps} />
      ))}
    </>
  );
}
