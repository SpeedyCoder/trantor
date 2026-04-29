import { useEffect } from "react";
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  GitHubPullRequestReviewThread,
  WorkspaceInfo,
} from "../../../types";
import type { GitDiffSource, GitPanelMode } from "../types";
import { useGitHubIssues } from "../hooks/useGitHubIssues";
import { useGitHubPullRequests } from "../hooks/useGitHubPullRequests";
import { useGitHubPullRequestDiffs } from "../hooks/useGitHubPullRequestDiffs";
import { useGitHubPullRequestComments } from "../hooks/useGitHubPullRequestComments";
import { useGitHubPullRequestReviewThreads } from "../hooks/useGitHubPullRequestReviewThreads";

type IssuesState = {
  issues: GitHubIssue[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

type PullRequestsState = {
  pullRequests: GitHubPullRequest[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

type PullRequestDiffsState = {
  diffs: GitHubPullRequestDiff[];
  isLoading: boolean;
  error: string | null;
};

type PullRequestCommentsState = {
  comments: GitHubPullRequestComment[];
  isLoading: boolean;
  error: string | null;
};

type PullRequestReviewThreadsState = {
  reviewThreads: GitHubPullRequestReviewThread[];
  isLoading: boolean;
  error: string | null;
};

type GitHubPanelDataProps = {
  activeWorkspace: WorkspaceInfo | null;
  gitPanelMode: GitPanelMode;
  shouldLoadDiffs: boolean;
  diffSource: GitDiffSource;
  selectedPullRequestNumber: number | null;
  onIssuesChange: (state: IssuesState) => void;
  onPullRequestsChange: (state: PullRequestsState) => void;
  onPullRequestDiffsChange: (state: PullRequestDiffsState) => void;
  onPullRequestCommentsChange: (state: PullRequestCommentsState) => void;
  onPullRequestReviewThreadsChange: (state: PullRequestReviewThreadsState) => void;
};

export function GitHubPanelData({
  activeWorkspace,
  gitPanelMode,
  shouldLoadDiffs,
  diffSource,
  selectedPullRequestNumber,
  onIssuesChange,
  onPullRequestsChange,
  onPullRequestDiffsChange,
  onPullRequestCommentsChange,
  onPullRequestReviewThreadsChange,
}: GitHubPanelDataProps) {
  const issuesEnabled = gitPanelMode === "issues";
  const pullRequestsEnabled = gitPanelMode === "prs" && Boolean(activeWorkspace);
  const pullRequestDiffsEnabled =
    shouldLoadDiffs && diffSource === "pr" && Boolean(activeWorkspace);
  const pullRequestCommentsEnabled = pullRequestDiffsEnabled;
  const pullRequestReviewThreadsEnabled = pullRequestDiffsEnabled;

  const {
    issues,
    total: issuesTotal,
    isLoading: issuesLoading,
    error: issuesError,
  } = useGitHubIssues(activeWorkspace, issuesEnabled);

  const {
    pullRequests,
    total: pullRequestsTotal,
    isLoading: pullRequestsLoading,
    error: pullRequestsError,
  } = useGitHubPullRequests(activeWorkspace, pullRequestsEnabled);

  const {
    diffs: pullRequestDiffs,
    isLoading: pullRequestDiffsLoading,
    error: pullRequestDiffsError,
  } = useGitHubPullRequestDiffs(
    activeWorkspace,
    selectedPullRequestNumber ?? null,
    pullRequestDiffsEnabled,
  );

  const {
    comments: pullRequestComments,
    isLoading: pullRequestCommentsLoading,
    error: pullRequestCommentsError,
  } = useGitHubPullRequestComments(
    activeWorkspace,
    selectedPullRequestNumber ?? null,
    pullRequestCommentsEnabled,
  );

  const {
    reviewThreads: pullRequestReviewThreads,
    isLoading: pullRequestReviewThreadsLoading,
    error: pullRequestReviewThreadsError,
  } = useGitHubPullRequestReviewThreads(
    activeWorkspace,
    selectedPullRequestNumber ?? null,
    pullRequestReviewThreadsEnabled,
  );

  useEffect(() => {
    onIssuesChange({
      issues,
      total: issuesTotal,
      isLoading: issuesLoading,
      error: issuesError,
    });
  }, [issues, issuesError, issuesLoading, issuesTotal, onIssuesChange]);

  useEffect(() => {
    onPullRequestsChange({
      pullRequests,
      total: pullRequestsTotal,
      isLoading: pullRequestsLoading,
      error: pullRequestsError,
    });
  }, [
    onPullRequestsChange,
    pullRequests,
    pullRequestsError,
    pullRequestsLoading,
    pullRequestsTotal,
  ]);

  useEffect(() => {
    onPullRequestDiffsChange({
      diffs: pullRequestDiffs,
      isLoading: pullRequestDiffsLoading,
      error: pullRequestDiffsError,
    });
  }, [
    onPullRequestDiffsChange,
    pullRequestDiffs,
    pullRequestDiffsError,
    pullRequestDiffsLoading,
  ]);

  useEffect(() => {
    onPullRequestCommentsChange({
      comments: pullRequestComments,
      isLoading: pullRequestCommentsLoading,
      error: pullRequestCommentsError,
    });
  }, [
    onPullRequestCommentsChange,
    pullRequestComments,
    pullRequestCommentsError,
    pullRequestCommentsLoading,
  ]);

  useEffect(() => {
    onPullRequestReviewThreadsChange({
      reviewThreads: pullRequestReviewThreads,
      isLoading: pullRequestReviewThreadsLoading,
      error: pullRequestReviewThreadsError,
    });
  }, [
    onPullRequestReviewThreadsChange,
    pullRequestReviewThreads,
    pullRequestReviewThreadsError,
    pullRequestReviewThreadsLoading,
  ]);

  return null;
}
