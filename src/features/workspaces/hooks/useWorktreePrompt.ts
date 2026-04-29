import { useCallback, useEffect, useRef, useState } from "react";
import type { LinearIssue, WorkspaceInfo } from "../../../types";
import { searchLinearIssues } from "../../../services/tauri";
import { buildDefaultWorktreeBranch } from "../utils/worktreeBranchFormat";

export type WorktreePromptTab = "linear" | "manual";

export type WorktreeCreatedContext = {
  linearIssue?: LinearIssue;
  prefillPrompt?: string;
};

type WorktreePromptState = {
  workspace: WorkspaceInfo;
  activeTab: WorktreePromptTab;
  linearEnabled: boolean;
  linearQuery: string;
  linearIssues: LinearIssue[];
  linearTotal: number;
  linearLoading: boolean;
  selectedLinearIssue: LinearIssue | null;
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
  linearEnabled?: boolean;
  defaultBranchFormat?: string | null;
  onWorktreeCreated?: (
    worktree: WorkspaceInfo,
    parent: WorkspaceInfo,
    context?: WorktreeCreatedContext,
  ) => Promise<void> | void;
  onCompactActivate?: () => void;
  onError?: (message: string) => void;
};

type UseWorktreePromptResult = {
  worktreePrompt: WorktreePromptState;
  openPrompt: (workspace: WorkspaceInfo) => void;
  confirmPrompt: () => Promise<void>;
  selectLinearIssue: (issue: LinearIssue) => void;
  cancelPrompt: () => void;
  updateBranch: (value: string) => void;
  updateLinearQuery: (value: string) => void;
  switchTab: (tab: WorktreePromptTab) => void;
};

function buildLinearIssuePrompt(issue: LinearIssue): string {
  const description = issue.description?.trim() || "No description provided.";
  return `Work on Linear issue ${issue.identifier}: ${issue.title}

URL: ${issue.url}

Description:
${description}`;
}

export function useWorktreePrompt({
  addWorktreeAgent,
  connectWorkspace,
  onSelectWorkspace,
  linearEnabled = false,
  defaultBranchFormat = null,
  onWorktreeCreated,
  onCompactActivate,
  onError,
}: UseWorktreePromptOptions): UseWorktreePromptResult {
  const [worktreePrompt, setWorktreePrompt] = useState<WorktreePromptState>(null);
  const linearRequestIdRef = useRef(0);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const openPrompt = useCallback((workspace: WorkspaceInfo) => {
    const defaultBranch = buildDefaultWorktreeBranch(defaultBranchFormat, workspace);
    const hasLinear = linearEnabled;
    setWorktreePrompt({
      workspace,
      activeTab: hasLinear ? "linear" : "manual",
      linearEnabled: hasLinear,
      linearQuery: "",
      linearIssues: [],
      linearTotal: 0,
      linearLoading: false,
      selectedLinearIssue: null,
      branch: defaultBranch,
      branchWasEdited: false,
      isSubmitting: false,
      error: null,
    });
  }, [defaultBranchFormat, linearEnabled]);

  useEffect(() => {
    if (!worktreePrompt?.linearEnabled || worktreePrompt.activeTab !== "linear") {
      return;
    }
    const workspaceId = worktreePrompt.workspace.id;
    const query = worktreePrompt.linearQuery;
    const requestId = linearRequestIdRef.current + 1;
    linearRequestIdRef.current = requestId;
    setWorktreePrompt((prev) =>
      prev ? { ...prev, linearLoading: true, error: null } : prev,
    );
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await searchLinearIssues(workspaceId, query);
          if (linearRequestIdRef.current !== requestId) {
            return;
          }
          setWorktreePrompt((prev) =>
            prev
              ? {
                  ...prev,
                  linearIssues: response.issues,
                  linearTotal: response.total,
                  linearLoading: false,
                  error: null,
                }
              : prev,
          );
        } catch (error) {
          if (linearRequestIdRef.current !== requestId) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          setWorktreePrompt((prev) =>
            prev
              ? {
                  ...prev,
                  linearIssues: [],
                  linearTotal: 0,
                  linearLoading: false,
                  error: message,
                }
              : prev,
          );
          onErrorRef.current?.(message);
        }
      })();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    worktreePrompt?.activeTab,
    worktreePrompt?.linearEnabled,
    worktreePrompt?.linearQuery,
    worktreePrompt?.workspace.id,
  ]);

  const updateBranch = useCallback((value: string) => {
    setWorktreePrompt((prev) =>
      prev ? { ...prev, branch: value, branchWasEdited: true, error: null } : prev,
    );
  }, []);

  const updateLinearQuery = useCallback((value: string) => {
    setWorktreePrompt((prev) =>
      prev ? { ...prev, linearQuery: value, selectedLinearIssue: null, error: null } : prev,
    );
  }, []);

  const switchTab = useCallback((tab: WorktreePromptTab) => {
    setWorktreePrompt((prev) => (prev ? { ...prev, activeTab: tab, error: null } : prev));
  }, []);

  const cancelPrompt = useCallback(() => {
    setWorktreePrompt(null);
  }, []);

  const createWorktree = useCallback(async (
    branch: string,
    context?: WorktreeCreatedContext,
  ) => {
    if (!worktreePrompt || worktreePrompt.isSubmitting) {
      return;
    }
    const snapshot = worktreePrompt;
    setWorktreePrompt((prev) =>
      prev ? { ...prev, isSubmitting: true, error: null } : prev,
    );

    try {
      const worktreeWorkspace = await addWorktreeAgent(snapshot.workspace, branch, {
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
        await onWorktreeCreated?.(worktreeWorkspace, snapshot.workspace, context);
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

  const confirmPrompt = useCallback(async () => {
    if (!worktreePrompt) {
      return;
    }
    if (worktreePrompt.activeTab === "linear") {
      const issue = worktreePrompt.selectedLinearIssue;
      if (!issue) {
        return;
      }
      const branch = issue.branchName?.trim();
      if (!branch) {
        const message = "Linear did not return a branch name for this issue.";
        setWorktreePrompt((prev) => (prev ? { ...prev, error: message } : prev));
        onError?.(message);
        return;
      }
      await createWorktree(branch, {
        linearIssue: issue,
        prefillPrompt: buildLinearIssuePrompt(issue),
      });
      return;
    }
    await createWorktree(worktreePrompt.branch);
  }, [createWorktree, onError, worktreePrompt]);

  const selectLinearIssue = useCallback(
    (issue: LinearIssue) => {
      const branch = issue.branchName?.trim();
      if (!branch) {
        const message = "Linear did not return a branch name for this issue.";
        setWorktreePrompt((prev) =>
          prev ? { ...prev, selectedLinearIssue: null, error: message } : prev,
        );
        onError?.(message);
        return;
      }
      setWorktreePrompt((prev) =>
        prev ? { ...prev, selectedLinearIssue: issue, error: null } : prev,
      );
    },
    [onError],
  );

  return {
    worktreePrompt,
    openPrompt,
    confirmPrompt,
    selectLinearIssue,
    cancelPrompt,
    updateBranch,
    updateLinearQuery,
    switchTab,
  };
}
