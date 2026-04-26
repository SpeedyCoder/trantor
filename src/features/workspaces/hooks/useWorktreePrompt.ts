import { useCallback, useState } from "react";
import type { WorkspaceInfo } from "../../../types";

type WorktreePromptState = {
  workspace: WorkspaceInfo;
  branch: string;
  branchWasEdited: boolean;
  isSubmitting: boolean;
  error: string | null;
} | null;

type UseWorktreePromptOptions = {
  addWorktreeAgent: (
    workspace: WorkspaceInfo,
    branch: string,
    options?: { displayName?: string | null; copyAgentsMd?: boolean },
  ) => Promise<WorkspaceInfo | null>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  onSelectWorkspace: (workspaceId: string) => void;
  onWorktreeCreated?: (worktree: WorkspaceInfo, parent: WorkspaceInfo) => Promise<void> | void;
  onCompactActivate?: () => void;
  onError?: (message: string) => void;
};

type UseWorktreePromptResult = {
  worktreePrompt: WorktreePromptState;
  openPrompt: (workspace: WorkspaceInfo) => void;
  confirmPrompt: () => Promise<void>;
  cancelPrompt: () => void;
  updateBranch: (value: string) => void;
};

export function useWorktreePrompt({
  addWorktreeAgent,
  connectWorkspace,
  onSelectWorkspace,
  onWorktreeCreated,
  onCompactActivate,
  onError,
}: UseWorktreePromptOptions): UseWorktreePromptResult {
  const [worktreePrompt, setWorktreePrompt] = useState<WorktreePromptState>(null);

  const openPrompt = useCallback((workspace: WorkspaceInfo) => {
    const defaultBranch = `codex/${new Date().toISOString().slice(0, 10)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    setWorktreePrompt({
      workspace,
      branch: defaultBranch,
      branchWasEdited: false,
      isSubmitting: false,
      error: null,
    });
  }, []);

  const updateBranch = useCallback((value: string) => {
    setWorktreePrompt((prev) =>
      prev ? { ...prev, branch: value, branchWasEdited: true, error: null } : prev,
    );
  }, []);

  const cancelPrompt = useCallback(() => {
    setWorktreePrompt(null);
  }, []);

  const confirmPrompt = useCallback(async () => {
    if (!worktreePrompt || worktreePrompt.isSubmitting) {
      return;
    }
    const snapshot = worktreePrompt;
    setWorktreePrompt((prev) =>
      prev ? { ...prev, isSubmitting: true, error: null } : prev,
    );

    try {
      const worktreeWorkspace = await addWorktreeAgent(snapshot.workspace, snapshot.branch, {
        displayName: null,
        copyAgentsMd: true,
      });
      if (!worktreeWorkspace) {
        setWorktreePrompt(null);
        return;
      }
      onSelectWorkspace(worktreeWorkspace.id);
      if (!worktreeWorkspace.connected) {
        await connectWorkspace(worktreeWorkspace);
      }
      try {
        await onWorktreeCreated?.(worktreeWorkspace, snapshot.workspace);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError?.(message);
      }
      onCompactActivate?.();
      setWorktreePrompt(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorktreePrompt((prev) =>
        prev ? { ...prev, isSubmitting: false, error: message } : prev,
      );
      onError?.(message);
    }
  }, [
    addWorktreeAgent,
    connectWorkspace,
    onCompactActivate,
    onError,
    onSelectWorkspace,
    onWorktreeCreated,
    worktreePrompt,
  ]);

  return {
    worktreePrompt,
    openPrompt,
    confirmPrompt,
    cancelPrompt,
    updateBranch,
  };
}
