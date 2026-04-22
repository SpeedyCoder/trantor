import { createPortal } from "react-dom";
import type { MouseEvent, MutableRefObject } from "react";
import Copy from "lucide-react/dist/esm/icons/copy";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Plus from "lucide-react/dist/esm/icons/plus";

import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { ThreadList } from "./ThreadList";
import { ThreadLoading } from "./ThreadLoading";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorkspaceGroup } from "./WorkspaceGroup";
import { WorktreeSection } from "./WorktreeSection";
import type {
  SidebarWorkspaceAddMenuAnchor,
  ThreadRowsResult,
  WorkspaceGroupSection,
} from "./sidebarTypes";

type SidebarWorkspaceGroupsProps = {
  groups: WorkspaceGroupSection[];
  hasWorkspaceGroups: boolean;
  collapsedGroups: Set<string>;
  ungroupedCollapseId: string;
  toggleGroupCollapse: (groupId: string) => void;
  cloneChildIds: Set<string>;
  clonesBySource: Map<string, WorkspaceInfo[]>;
  worktreesByParent: Map<string, WorkspaceInfo[]>;
  deletingWorktreeIds: Set<string>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: ThreadStatusById;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  pendingUserInputKeys?: Set<string>;
  getThreadRows: (
    threads: ThreadSummary[],
    isExpanded: boolean,
    workspaceId: string,
    getPinTimestamp: (workspaceId: string, threadId: string) => number | null,
    pinVersion?: number,
  ) => ThreadRowsResult;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  pinnedThreadsVersion: number;
  addMenuAnchor: SidebarWorkspaceAddMenuAnchor | null;
  addMenuRef: MutableRefObject<HTMLDivElement | null>;
  addMenuWidth: number;
  newAgentDraftWorkspaceId?: string | null;
  startingDraftThreadWorkspaceId?: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onAddCloneAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  onShowWorkspaceMenu: (event: MouseEvent, workspaceId: string) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  onShowCloneMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onToggleAddMenu: (anchor: SidebarWorkspaceAddMenuAnchor | null) => void;
};

type SidebarWorkspaceEntryProps = Omit<
  SidebarWorkspaceGroupsProps,
  | "groups"
  | "hasWorkspaceGroups"
  | "collapsedGroups"
  | "ungroupedCollapseId"
  | "toggleGroupCollapse"
> & {
  workspace: WorkspaceInfo;
};

function SidebarWorkspaceEntry({
  workspace,
  cloneChildIds,
  clonesBySource,
  worktreesByParent,
  deletingWorktreeIds,
  threadsByWorkspace,
  threadStatusById,
  threadListLoadingByWorkspace,
  threadListPagingByWorkspace,
  threadListCursorByWorkspace,
  activeWorkspaceId,
  activeThreadId,
  pendingUserInputKeys,
  getThreadRows,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  getPinTimestamp,
  pinnedThreadsVersion,
  addMenuAnchor,
  addMenuRef,
  addMenuWidth,
  newAgentDraftWorkspaceId,
  startingDraftThreadWorkspaceId,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddAgent,
  onAddWorktreeAgent,
  onAddCloneAgent,
  onToggleWorkspaceCollapse,
  onSelectThread,
  onShowThreadMenu,
  onShowWorkspaceMenu,
  onShowWorktreeMenu,
  onShowCloneMenu,
  onLoadOlderThreads,
  onToggleAddMenu,
}: SidebarWorkspaceEntryProps) {
  if (cloneChildIds.has(workspace.id)) {
    return null;
  }

  const threads = threadsByWorkspace[workspace.id] ?? [];
  const isCollapsed = workspace.settings.sidebarCollapsed;
  const { unpinnedRows } = getThreadRows(
    threads,
    true,
    workspace.id,
    getPinTimestamp,
    pinnedThreadsVersion,
  );
  const nextCursor = threadListCursorByWorkspace[workspace.id] ?? null;
  const showThreadList = unpinnedRows.length > 0 || Boolean(nextCursor);
  const isLoadingThreads = threadListLoadingByWorkspace[workspace.id] ?? false;
  const showThreadLoader = isLoadingThreads && threads.length === 0;
  const isPaging = threadListPagingByWorkspace[workspace.id] ?? false;
  const clones = clonesBySource.get(workspace.id) ?? [];
  const worktrees = worktreesByParent.get(workspace.id) ?? [];
  const addMenuOpen = addMenuAnchor?.workspaceId === workspace.id;
  const isDraftNewAgent = newAgentDraftWorkspaceId === workspace.id;
  const isDraftRowActive =
    isDraftNewAgent &&
    workspace.id === activeWorkspaceId &&
    !activeThreadId;
  const draftStatusClass =
    startingDraftThreadWorkspaceId === workspace.id ? "processing" : "ready";

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
      {addMenuOpen && addMenuAnchor &&
        createPortal(
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
                onAddAgent(workspace);
              }}
              icon={<Plus aria-hidden />}
            >
              New agent
            </PopoverMenuItem>
            <PopoverMenuItem
              className="workspace-add-option"
              onClick={(event) => {
                event.stopPropagation();
                onToggleAddMenu(null);
                onAddWorktreeAgent(workspace);
              }}
              icon={<GitBranch aria-hidden />}
            >
              New worktree agent
            </PopoverMenuItem>
            <PopoverMenuItem
              className="workspace-add-option"
              onClick={(event) => {
                event.stopPropagation();
                onToggleAddMenu(null);
                onAddCloneAgent(workspace);
              }}
              icon={<Copy aria-hidden />}
            >
              New clone agent
            </PopoverMenuItem>
          </PopoverSurface>,
          document.body,
        )}
      {isDraftNewAgent && (
        <div
          className={`thread-row thread-row-draft${isDraftRowActive ? " active" : ""}`}
          onClick={() => onSelectWorkspace(workspace.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectWorkspace(workspace.id);
            }
          }}
        >
          <span className={`thread-status ${draftStatusClass}`} aria-hidden />
          <div className="thread-content">
            <div className="thread-headline">
              <span className="thread-name">New Agent</span>
            </div>
          </div>
        </div>
      )}
      {clones.length > 0 && (
        <WorktreeSection
          worktrees={clones}
          deletingWorktreeIds={deletingWorktreeIds}
          threadsByWorkspace={threadsByWorkspace}
          threadStatusById={threadStatusById}
          threadListLoadingByWorkspace={threadListLoadingByWorkspace}
          threadListPagingByWorkspace={threadListPagingByWorkspace}
          threadListCursorByWorkspace={threadListCursorByWorkspace}
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadRows={getThreadRows}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          getPinTimestamp={getPinTimestamp}
          pinnedThreadsVersion={pinnedThreadsVersion}
          onSelectWorkspace={onSelectWorkspace}
          onConnectWorkspace={onConnectWorkspace}
          onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
          onShowWorktreeMenu={onShowCloneMenu}
          onLoadOlderThreads={onLoadOlderThreads}
          sectionLabel="Clone agents"
          sectionIcon={<Copy className="worktree-header-icon" aria-hidden />}
          className="clone-section"
        />
      )}
      {worktrees.length > 0 && (
        <WorktreeSection
          worktrees={worktrees}
          deletingWorktreeIds={deletingWorktreeIds}
          threadsByWorkspace={threadsByWorkspace}
          threadStatusById={threadStatusById}
          threadListLoadingByWorkspace={threadListLoadingByWorkspace}
          threadListPagingByWorkspace={threadListPagingByWorkspace}
          threadListCursorByWorkspace={threadListCursorByWorkspace}
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadRows={getThreadRows}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          getPinTimestamp={getPinTimestamp}
          pinnedThreadsVersion={pinnedThreadsVersion}
          onSelectWorkspace={onSelectWorkspace}
          onConnectWorkspace={onConnectWorkspace}
          onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
          onShowWorktreeMenu={onShowWorktreeMenu}
          onLoadOlderThreads={onLoadOlderThreads}
        />
      )}
      {showThreadList && (
        <ThreadList
          workspaceId={workspace.id}
          pinnedRows={[]}
          unpinnedRows={unpinnedRows}
          nextCursor={nextCursor}
          isPaging={isPaging}
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          threadStatusById={threadStatusById}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          onLoadOlderThreads={onLoadOlderThreads}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
        />
      )}
      {showThreadLoader && <ThreadLoading />}
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
  return groups.map((group) => {
    const showGroupHeader = Boolean(group.id) || hasWorkspaceGroups;
    const toggleId = group.id ?? (showGroupHeader ? ungroupedCollapseId : null);
    const isGroupCollapsed = Boolean(toggleId && collapsedGroups.has(toggleId));

    return (
      <WorkspaceGroup
        key={group.id ?? "ungrouped"}
        toggleId={toggleId}
        name={group.name}
        showHeader={showGroupHeader}
        isCollapsed={isGroupCollapsed}
        onToggleCollapse={toggleGroupCollapse}
      >
        {group.workspaces.map((workspace) => (
          <SidebarWorkspaceEntry
            key={workspace.id}
            workspace={workspace}
            {...entryProps}
          />
        ))}
      </WorkspaceGroup>
    );
  });
}
