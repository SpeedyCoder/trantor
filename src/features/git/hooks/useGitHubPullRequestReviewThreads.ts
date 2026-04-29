import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubPullRequestReviewThread, WorkspaceInfo } from "../../../types";
import { getGitHubPullRequestReviewThreads } from "../../../services/tauri";

type PullRequestReviewThreadsState = {
  reviewThreads: GitHubPullRequestReviewThread[];
  isLoading: boolean;
  error: string | null;
};

const emptyState: PullRequestReviewThreadsState = {
  reviewThreads: [],
  isLoading: false,
  error: null,
};

export function useGitHubPullRequestReviewThreads(
  activeWorkspace: WorkspaceInfo | null,
  prNumber: number | null,
  enabled: boolean,
) {
  const [state, setState] = useState<PullRequestReviewThreadsState>(emptyState);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const prNumberRef = useRef<number | null>(prNumber ?? null);

  const refresh = useCallback(async () => {
    if (!activeWorkspace || !prNumber) {
      setState(emptyState);
      return;
    }
    const workspaceId = activeWorkspace.id;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const reviewThreads = await getGitHubPullRequestReviewThreads(
        workspaceId,
        prNumber,
      );
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId ||
        prNumberRef.current !== prNumber
      ) {
        return;
      }
      setState({ reviewThreads, isLoading: false, error: null });
    } catch (error) {
      console.error("Failed to load GitHub pull request review threads", error);
      if (
        requestIdRef.current !== requestId ||
        workspaceIdRef.current !== workspaceId ||
        prNumberRef.current !== prNumber
      ) {
        return;
      }
      setState({
        reviewThreads: [],
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeWorkspace, prNumber]);

  const replaceReviewThread = useCallback((thread: GitHubPullRequestReviewThread) => {
    setState((prev) => ({
      ...prev,
      reviewThreads: prev.reviewThreads.map((entry) =>
        entry.id === thread.id ? thread : entry,
      ),
    }));
  }, []);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      setState(emptyState);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (prNumberRef.current !== prNumber) {
      prNumberRef.current = prNumber ?? null;
      requestIdRef.current += 1;
      setState(emptyState);
    }
  }, [prNumber]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return {
    reviewThreads: state.reviewThreads,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    replaceReviewThread,
  };
}
