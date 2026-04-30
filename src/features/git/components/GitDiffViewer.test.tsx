/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GitDiffViewer } from "./GitDiffViewer";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 260,
      })),
    getTotalSize: () => count * 260,
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));

vi.mock("@pierre/diffs", () => ({
  parsePatchFiles: (diff: string) =>
    diff.includes("@@")
      ? [
          {
            files: [
              {
                name: "src/main.ts",
                prevName: undefined,
                type: "change",
                hunks: [],
                splitLineCount: 0,
                unifiedLineCount: 0,
              },
            ],
          },
        ]
      : [],
}));

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    renderHoverUtility,
    lineAnnotations,
    renderAnnotation,
  }: {
    renderHoverUtility?: (
      getHoveredLine: () =>
        | { lineNumber: number; side?: "additions" | "deletions" }
        | undefined,
    ) => ReactNode;
    lineAnnotations?: Array<{
      side: "additions" | "deletions";
      lineNumber: number;
      metadata: { thread: { id: string } };
    }>;
    renderAnnotation?: (annotation: {
      side: "additions" | "deletions";
      lineNumber: number;
      metadata: { thread: { id: string } };
    }) => ReactNode;
  }) => (
    <div>
      {renderHoverUtility
        ? renderHoverUtility(() => ({ lineNumber: 2, side: "additions" }))
        : null}
      {lineAnnotations?.map((annotation) => (
        <div
          key={annotation.metadata.thread.id}
          data-testid={`annotation-${annotation.side}-${annotation.lineNumber}`}
        >
          {renderAnnotation?.(annotation)}
        </div>
      ))}
    </div>
  ),
  WorkerPoolContextProvider: ({ children }: { children: ReactNode }) => children,
}));

beforeAll(() => {
  if (typeof window.ResizeObserver !== "undefined") {
    return;
  }
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock;
});

afterEach(() => {
  cleanup();
});

describe("GitDiffViewer", () => {
  it("inserts a diff line reference into composer when the line '+' action is clicked", () => {
    const onInsertComposerText = vi.fn();

    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts@@item-change-1@@change-0",
            displayPath: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+added line",
          },
        ]}
        selectedPath="src/main.ts@@item-change-1@@change-0"
        isLoading={false}
        error={null}
        diffStyle="unified"
        onInsertComposerText={onInsertComposerText}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Ask for changes on hovered line" }),
    );

    expect(onInsertComposerText).toHaveBeenCalledTimes(1);
    expect(onInsertComposerText).toHaveBeenCalledWith(
      "src/main.ts:L2\n```diff\n+added line\n```\n\n",
    );
  });

  it("renders raw fallback lines instead of Diff unavailable for non-patch diffs", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts@@item-change-1@@change-0",
            displayPath: "src/main.ts",
            status: "M",
            diff: "file edited\n+added line\n-removed line",
          },
        ]}
        selectedPath="src/main.ts@@item-change-1@@change-0"
        isLoading={false}
        error={null}
      />,
    );

    expect(screen.queryByText("Diff unavailable.")).toBeNull();
    expect(screen.getByText("added line")).toBeTruthy();
    expect(screen.getByText("removed line")).toBeTruthy();

    const rawLines = Array.from(document.querySelectorAll(".diff-viewer-raw-line"));
    expect(rawLines[1]?.className).toContain("diff-viewer-raw-line-add");
    expect(rawLines[2]?.className).toContain("diff-viewer-raw-line-del");
  });

  it("passes review threads as line annotations and collapses resolved threads", () => {
    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+added line",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="unified"
        pullRequestReviewThreads={[
          {
            id: "thread-open",
            isResolved: false,
            path: "src/main.ts",
            line: 2,
            startLine: null,
            diffSide: "RIGHT",
            url: "",
            comments: [
              {
                id: "comment-open",
                databaseId: 1,
                body: "Please adjust this",
                createdAt: "2026-04-29T10:00:00Z",
                url: "",
                author: { login: "reviewer" },
              },
            ],
          },
          {
            id: "thread-resolved",
            isResolved: true,
            path: "src/main.ts",
            line: 1,
            startLine: null,
            diffSide: "LEFT",
            url: "",
            comments: [
              {
                id: "comment-resolved",
                databaseId: 2,
                body: "Old issue",
                createdAt: "2026-04-29T10:00:00Z",
                url: "",
                author: { login: "reviewer" },
              },
            ],
          },
        ]}
        onReplyPullRequestReviewThread={vi.fn()}
        onResolvePullRequestReviewThread={vi.fn()}
        onAddPullRequestReviewThreadToChat={vi.fn()}
      />,
    );

    expect(screen.getByTestId("annotation-additions-2")).toBeTruthy();
    expect(screen.getByTestId("annotation-deletions-1")).toBeTruthy();
    expect(screen.getByText("Please adjust this")).toBeTruthy();
    expect(screen.queryByText("Unresolved")).toBeNull();
    const replyButton = screen.getByRole("button", { name: "Reply" });
    const actions = replyButton.closest(".diff-viewer-inline-thread-actions");
    expect(actions?.textContent).toContain("Add to chat");
    expect(actions?.textContent).toContain("Resolve");
    expect(screen.queryByText("Old issue")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Old issue")).toBeTruthy();
  });

  it("shows an added state after the review thread is attached", async () => {
    const onAddPullRequestReviewThreadToChat = vi.fn().mockResolvedValue(undefined);

    render(
      <GitDiffViewer
        diffs={[
          {
            path: "src/main.ts",
            status: "M",
            diff: "@@ -1,1 +1,2 @@\n line one\n+added line",
          },
        ]}
        selectedPath="src/main.ts"
        isLoading={false}
        error={null}
        diffStyle="unified"
        pullRequestReviewThreads={[
          {
            id: "thread-open",
            isResolved: false,
            path: "src/main.ts",
            line: 2,
            startLine: null,
            diffSide: "RIGHT",
            url: "",
            comments: [
              {
                id: "comment-open",
                databaseId: 1,
                body: "Please adjust this",
                createdAt: "2026-04-29T10:00:00Z",
                url: "",
                author: { login: "reviewer" },
              },
            ],
          },
        ]}
        onAddPullRequestReviewThreadToChat={onAddPullRequestReviewThreadToChat}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to chat" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Add to chat" })).toBeNull();
    });
    expect(screen.getByText("Added to chat")).toBeTruthy();
    expect(onAddPullRequestReviewThreadToChat).toHaveBeenCalledTimes(1);
  });
});
