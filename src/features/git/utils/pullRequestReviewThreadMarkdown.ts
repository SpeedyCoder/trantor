import type {
  GitHubPullRequest,
  GitHubPullRequestReviewThread,
  WorkspaceInfo,
} from "../../../types";

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "thread";
}

function escapeMarkdown(value: string) {
  return value.replace(/\|/g, "\\|");
}

export function buildPullRequestReviewThreadMarkdown({
  pullRequest,
  thread,
}: {
  pullRequest: GitHubPullRequest;
  thread: GitHubPullRequestReviewThread;
}) {
  const location = [
    thread.path,
    thread.startLine ? `L${thread.startLine}` : null,
    thread.line && thread.line !== thread.startLine ? `L${thread.line}` : null,
  ]
    .filter(Boolean)
    .join(":");
  const lines = [
    `# GitHub PR #${pullRequest.number} Review Thread`,
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| PR | [#${pullRequest.number} ${escapeMarkdown(pullRequest.title)}](${pullRequest.url}) |`,
    `| Location | \`${escapeMarkdown(location || thread.path)}\` |`,
    `| Status | ${thread.isResolved ? "Resolved" : "Unresolved"} |`,
    `| URL | ${thread.url ? `[Open thread](${thread.url})` : "Unavailable"} |`,
    "",
    "## Comments",
    "",
  ];

  thread.comments.forEach((comment, index) => {
    const author = comment.author?.login ?? "unknown";
    lines.push(`### ${index + 1}. @${author} (${comment.createdAt})`);
    if (comment.url) {
      lines.push("");
      lines.push(`[Open comment](${comment.url})`);
    }
    lines.push("");
    lines.push(comment.body.trim() || "_No comment body._");
    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}

export function pullRequestReviewThreadMarkdownPath({
  workspace,
  pullRequest,
  thread,
}: {
  workspace: WorkspaceInfo;
  pullRequest: GitHubPullRequest;
  thread: GitHubPullRequestReviewThread;
}) {
  const shortThreadId = sanitizePathSegment(thread.id).slice(0, 48);
  return `${workspace.path}/.trantor/pr-comments/pr-${pullRequest.number}/thread-${shortThreadId}.md`;
}
