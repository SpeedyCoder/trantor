import type { MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorktreeSection } from "./WorktreeSection";

type SidebarWorkspaceGroupsProps = {
  workspaces: WorkspaceInfo[];
  worktreesByParent: Map<string, WorkspaceInfo[]>;
  deletingWorktreeIds: Set<string>;
  defaultWorktreeBranchFormat: string;
  activeAgentWorkspaceIds: Set<string>;
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
  "workspaces"
> & {
  workspace: WorkspaceInfo;
};

function SidebarWorkspaceEntry({
  workspace,
  worktreesByParent,
  deletingWorktreeIds,
  defaultWorktreeBranchFormat,
  activeAgentWorkspaceIds,
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
      hasActiveAgent={activeAgentWorkspaceIds.has(workspace.id)}
      onShowWorkspaceMenu={onShowWorkspaceMenu}
      onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
      onConnectWorkspace={onConnectWorkspace}
      onAddWorktreeAgent={onAddWorktreeAgent}
    >
      {worktrees.length > 0 ? (
        <WorktreeSection
          worktrees={worktrees}
          deletingWorktreeIds={deletingWorktreeIds}
          defaultWorktreeBranchFormat={defaultWorktreeBranchFormat}
          activeAgentWorkspaceIds={activeAgentWorkspaceIds}
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
  workspaces,
  ...entryProps
}: SidebarWorkspaceGroupsProps) {
  return (
    <>
      {workspaces.map((workspace) => (
        <SidebarWorkspaceEntry key={workspace.id} workspace={workspace} {...entryProps} />
      ))}
    </>
  );
}
