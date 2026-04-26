import Plus from "lucide-react/dist/esm/icons/plus";

import type { ThreadSummary, WorkspaceInfo } from "../../../types";

type WorktreeThreadTabsProps = {
  workspace: WorkspaceInfo;
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onStartThread: (workspaceId: string) => void;
};

function getThreadLabel(thread: ThreadSummary) {
  const trimmed = thread.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled thread";
}

export function WorktreeThreadTabs({
  workspace,
  threads,
  activeThreadId,
  onSelectThread,
  onStartThread,
}: WorktreeThreadTabsProps) {
  return (
    <div className="worktree-thread-tabs">
      <div className="worktree-thread-tabs-scroll">
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          return (
            <button
              key={thread.id}
              type="button"
              className={`worktree-thread-tab${isActive ? " is-active" : ""}`}
              onClick={() => onSelectThread(workspace.id, thread.id)}
            >
              <span className="worktree-thread-tab-label">{getThreadLabel(thread)}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="worktree-thread-tab-add"
        onClick={() => onStartThread(workspace.id)}
        aria-label={`Start a new thread in ${workspace.name}`}
        title="New thread"
      >
        <Plus size={14} aria-hidden />
      </button>
    </div>
  );
}
