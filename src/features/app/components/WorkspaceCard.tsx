import type { MouseEvent } from "react";
import Folder from "lucide-react/dist/esm/icons/folder";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";

import type { WorkspaceInfo } from "../../../types";

type WorkspaceCardProps = {
  workspace: WorkspaceInfo;
  workspaceName?: React.ReactNode;
  isCollapsed: boolean;
  hasActiveAgent?: boolean;
  onShowWorkspaceMenu: (event: MouseEvent, workspaceId: string) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  children?: React.ReactNode;
};

export function WorkspaceCard({
  workspace,
  workspaceName,
  isCollapsed,
  hasActiveAgent = false,
  onShowWorkspaceMenu,
  onToggleWorkspaceCollapse,
  onConnectWorkspace,
  onAddWorktreeAgent,
  children,
}: WorkspaceCardProps) {
  const contentCollapsedClass = isCollapsed ? " collapsed" : "";
  const FolderIcon = isCollapsed ? Folder : FolderOpen;

  return (
    <div className="workspace-card">
      <div
        className="workspace-row"
        role="button"
        tabIndex={0}
        onClick={() => onToggleWorkspaceCollapse(workspace.id, !isCollapsed)}
        onContextMenu={(event) => onShowWorkspaceMenu(event, workspace.id)}
        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${workspace.name}`}
        aria-expanded={!isCollapsed}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggleWorkspaceCollapse(workspace.id, !isCollapsed);
          }
        }}
      >
        <div className="workspace-copy">
          <div className="workspace-name-row">
            <div className="workspace-title">
              {hasActiveAgent ? (
                <span
                  className="workspace-activity-indicator is-active"
                  aria-label="Agent running in project"
                  role="status"
                />
              ) : null}
              <span className="workspace-folder-icon-frame" aria-hidden>
                <FolderIcon
                  className={`workspace-folder-icon${isCollapsed ? "" : " is-open"}`}
                />
              </span>
              <span className="workspace-name">{workspaceName ?? workspace.name}</span>
            </div>
          </div>
        </div>
        <div className="workspace-actions">
          <button
            className="ghost workspace-add"
            onClick={(event) => {
              event.stopPropagation();
              onAddWorktreeAgent(workspace);
            }}
            data-tauri-drag-region="false"
            aria-label="New worktree agent"
          >
            +
          </button>
          {!workspace.connected && (
            <span
              className="connect"
              title="Connect project context to the shared Codex server"
              onClick={(event) => {
                event.stopPropagation();
                onConnectWorkspace(workspace);
              }}
            >
              connect
            </span>
          )}
        </div>
      </div>
      <div
        className={`workspace-card-content${contentCollapsedClass}`}
        aria-hidden={isCollapsed}
        inert={isCollapsed ? true : undefined}
      >
        <div className="workspace-card-content-inner">{children}</div>
      </div>
    </div>
  );
}
