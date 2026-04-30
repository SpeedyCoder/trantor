import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import { TerminalTabs } from "../../terminal/components/TerminalTabs";
import type { ThreadStatusById } from "../../../utils/threadStatus";

type WorktreeThreadTabsProps = {
  workspace: WorkspaceInfo;
  threads: ThreadSummary[];
  threadStatusById: ThreadStatusById;
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
  threadStatusById,
  activeThreadId,
  onSelectThread,
  onStartThread,
}: WorktreeThreadTabsProps) {
  const tabs = threads
    .map((thread, index) => ({ thread, index }))
    .sort((a, b) => {
      const aTime = a.thread.createdAt ?? a.thread.updatedAt ?? 0;
      const bTime = b.thread.createdAt ?? b.thread.updatedAt ?? 0;
      return aTime === bTime ? a.index - b.index : aTime - bTime;
    })
    .map(({ thread }) => ({
      id: thread.id,
      title: getThreadLabel(thread),
      isProcessing: threadStatusById[thread.id]?.isProcessing ?? false,
    }));

  return (
    <TerminalTabs
      className="worktree-thread-tabs"
      tabs={tabs}
      activeTabId={activeThreadId}
      ariaLabel="Worktree agent threads"
      addLabel={`Start a new thread in ${workspace.name}`}
      addTitle="New thread"
      onSelectTab={(threadId) => onSelectThread(workspace.id, threadId)}
      onAddTab={() => onStartThread(workspace.id)}
    />
  );
}
