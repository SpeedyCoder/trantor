import { createPortal } from "react-dom";
import type { MouseEvent, MutableRefObject } from "react";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";

import type { WorkspaceInfo } from "../../../types";
import { PopoverMenuItem, PopoverSurface } from "../../design-system/components/popover/PopoverPrimitives";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorkspaceGroup } from "./WorkspaceGroup";
import { WorktreeSection } from "./WorktreeSection";
import type { SidebarWorkspaceAddMenuAnchor, WorkspaceGroupSection } from "./sidebarTypes";

type SidebarWorkspaceGroupsProps = {
  groups: WorkspaceGroupSection[];
  hasWorkspaceGroups: boolean;
  collapsedGroups: Set<string>;
  ungroupedCollapseId: string;
  toggleGroupCollapse: (groupId: string) => void;
  worktreesByParent: Map<string, WorkspaceInfo[]>;
  deletingWorktreeIds: Set<string>;
  activeWorkspaceId: string | null;
  addMenuAnchor: SidebarWorkspaceAddMenuAnchor | null;
  addMenuRef: MutableRefObject<HTMLDivElement | null>;
  addMenuWidth: number;
  onSelectWorkspace: (workspaceId: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onShowWorkspaceMenu: (event: MouseEvent, workspaceId: string) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  onToggleAddMenu: (anchor: SidebarWorkspaceAddMenuAnchor | null) => void;
};

type SidebarWorkspaceEntryProps = Omit<
  SidebarWorkspaceGroupsProps,
  "groups" | "hasWorkspaceGroups" | "collapsedGroups" | "ungroupedCollapseId" | "toggleGroupCollapse"
> & {
  workspace: WorkspaceInfo;
};

function SidebarWorkspaceEntry({
  workspace,
  worktreesByParent,
  deletingWorktreeIds,
  activeWorkspaceId,
  addMenuAnchor,
  addMenuRef,
  addMenuWidth,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddWorktreeAgent,
  onToggleWorkspaceCollapse,
  onShowWorkspaceMenu,
  onShowWorktreeMenu,
  onToggleAddMenu,
}: SidebarWorkspaceEntryProps) {
  const isCollapsed = workspace.settings.sidebarCollapsed;
  const worktrees = worktreesByParent.get(workspace.id) ?? [];
  const addMenuOpen = addMenuAnchor?.workspaceId === workspace.id;

  return (
    <WorkspaceCard
      workspace={workspace}
      workspaceName={workspace.name}
      isCollapsed={isCollapsed}
      addMenuOpen={addMenuOpen}
      addMenuWidth={addMenuWidth}
      onShowWorkspaceMenu={onShowWorkspaceMenu}
      onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
      onConnectWorkspace={onConnectWorkspace}
      onToggleAddMenu={onToggleAddMenu}
    >
      {addMenuOpen && addMenuAnchor
        ? createPortal(
            <PopoverSurface
              className="workspace-add-menu"
              ref={addMenuRef}
              style={{
                top: addMenuAnchor.top,
                left: addMenuAnchor.left,
                width: addMenuAnchor.width,
              }}
            >
              <PopoverMenuItem
                className="workspace-add-option"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleAddMenu(null);
                  onAddWorktreeAgent(workspace);
                }}
                icon={<GitBranch aria-hidden />}
              >
                New worktree
              </PopoverMenuItem>
            </PopoverSurface>,
            document.body,
          )
        : null}
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
  hasWorkspaceGroups,
  collapsedGroups,
  ungroupedCollapseId,
  toggleGroupCollapse,
  ...entryProps
}: SidebarWorkspaceGroupsProps) {
  return (
    <>
      {groups.map((group) => {
        const isGrouped = group.id !== null;
        const toggleId = isGrouped ? group.id : hasWorkspaceGroups ? ungroupedCollapseId : null;
        const isCollapsed = toggleId ? collapsedGroups.has(toggleId) : false;
        const visibleWorkspaces = group.workspaces.filter(
          (workspace) => (workspace.kind ?? "main") === "main",
        );
        if (!visibleWorkspaces.length) {
          return null;
        }
        return (
          <WorkspaceGroup
            key={group.id ?? "ungrouped"}
            toggleId={toggleId}
            name={group.name}
            showHeader={isGrouped || hasWorkspaceGroups}
            isCollapsed={isCollapsed}
            onToggleCollapse={toggleGroupCollapse}
          >
            {visibleWorkspaces.map((workspace) => (
              <SidebarWorkspaceEntry key={workspace.id} workspace={workspace} {...entryProps} />
            ))}
          </WorkspaceGroup>
        );
      })}
    </>
  );
}
