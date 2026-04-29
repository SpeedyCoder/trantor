import { memo, useEffect, useMemo, useState } from "react";
import {
  type DiffLineAnnotation,
  parsePatchFiles,
  type AnnotationSide,
  type FileDiffMetadata,
  type SelectedLineRange,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import type {
  GitHubPullRequestReviewThread,
  PullRequestReviewAction,
  PullRequestReviewIntent,
} from "../../../types";
import { parseDiff, type ParsedDiffLine } from "../../../utils/diff";
import { highlightLine, languageFromPath } from "../../../utils/syntax";
import { formatRelativeTime } from "../../../utils/time";
import { Markdown } from "../../messages/components/Markdown";
import {
  DIFF_VIEWER_SCROLL_CSS,
} from "../../design-system/diff/diffViewerTheme";
import { splitPath } from "./GitDiffPanel.utils";
import type { GitDiffViewerItem } from "./GitDiffViewer.types";
import {
  isFallbackRawDiffLineHighlightable,
  normalizePatchName,
  parseRawDiffLines,
} from "./GitDiffViewer.utils";

type ReviewThreadAnnotationMetadata = {
  thread: GitHubPullRequestReviewThread;
};

type ReviewThreadAnnotation = DiffLineAnnotation<ReviewThreadAnnotationMetadata>;

type HoveredDiffLine =
  | {
      lineNumber: number;
      side?: AnnotationSide;
      annotationSide?: AnnotationSide;
    }
  | undefined;

function isSelectableLine(
  line: ParsedDiffLine,
): line is ParsedDiffLine & { type: "add" | "del" | "context" } {
  return line.type === "add" || line.type === "del" || line.type === "context";
}

function resolveParsedLineForHover(
  parsedLines: ParsedDiffLine[],
  hovered: HoveredDiffLine,
): { line: ParsedDiffLine; index: number } | null {
  if (!hovered) {
    return null;
  }
  const side = hovered.annotationSide ?? hovered.side ?? "additions";
  const lineNumber = hovered.lineNumber;

  const matchForSide = (line: ParsedDiffLine) => {
    if (!isSelectableLine(line)) {
      return false;
    }
    if (side === "deletions") {
      return line.oldLine === lineNumber;
    }
    return line.newLine === lineNumber;
  };

  let index = parsedLines.findIndex(matchForSide);
  if (index >= 0) {
    return { line: parsedLines[index], index };
  }

  index = parsedLines.findIndex(
    (line) =>
      isSelectableLine(line) &&
      (line.newLine === lineNumber || line.oldLine === lineNumber),
  );
  if (index >= 0) {
    return { line: parsedLines[index], index };
  }

  return null;
}

export type DiffCardProps = {
  entry: GitDiffViewerItem;
  isSelected: boolean;
  diffStyle: "split" | "unified";
  isLoading: boolean;
  ignoreWhitespaceChanges: boolean;
  showRevert: boolean;
  onRequestRevert?: (path: string) => void;
  interactiveSelectionEnabled: boolean;
  selectedLines?: SelectedLineRange | null;
  onSelectedLinesChange?: (range: SelectedLineRange | null) => void;
  onLineAction?: (line: ParsedDiffLine, index: number) => void;
  reviewActions?: PullRequestReviewAction[];
  onRunReviewAction?: (
    intent: PullRequestReviewIntent,
    parsedLines: ParsedDiffLine[],
    selectedLines: SelectedLineRange | null,
  ) => void | Promise<void>;
  onClearSelection?: () => void;
  pullRequestReviewLaunching?: boolean;
  pullRequestReviewThreadId?: string | null;
  reviewThreads?: GitHubPullRequestReviewThread[];
  onReplyReviewThread?: (threadId: string, body: string) => Promise<void> | void;
  onResolveReviewThread?: (threadId: string) => Promise<void> | void;
  onAddReviewThreadToChat?: (thread: GitHubPullRequestReviewThread) => Promise<void> | void;
};

function ReviewThreadCard({
  thread,
  onReplyReviewThread,
  onResolveReviewThread,
  onAddReviewThreadToChat,
}: {
  thread: GitHubPullRequestReviewThread;
  onReplyReviewThread?: (threadId: string, body: string) => Promise<void> | void;
  onResolveReviewThread?: (threadId: string) => Promise<void> | void;
  onAddReviewThreadToChat?: (thread: GitHubPullRequestReviewThread) => Promise<void> | void;
}) {
  const [reply, setReply] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(thread.isResolved);
  const trimmedReply = reply.trim();
  const lineLabel = thread.startLine && thread.line && thread.startLine !== thread.line
    ? `L${thread.startLine}-L${thread.line}`
    : thread.line || thread.startLine
      ? `L${thread.line ?? thread.startLine}`
      : "File";

  useEffect(() => {
    if (thread.isResolved) {
      setIsCollapsed(true);
    }
  }, [thread.isResolved]);

  return (
    <div className="diff-viewer-inline-thread">
      <div className="diff-viewer-inline-thread-header">
        <span className="diff-viewer-inline-thread-location">{lineLabel}</span>
        <span className="diff-viewer-inline-thread-status">
          {thread.isResolved ? "Resolved" : "Unresolved"}
        </span>
        {thread.isResolved ? (
          <button
            type="button"
            className="ghost diff-viewer-inline-thread-action"
            onClick={() => setIsCollapsed((value) => !value)}
          >
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        ) : null}
        <button
          type="button"
          className="ghost diff-viewer-inline-thread-action"
          disabled={isAdding}
          onClick={() => {
            if (!onAddReviewThreadToChat) {
              return;
            }
            setIsAdding(true);
            Promise.resolve(onAddReviewThreadToChat(thread)).finally(() => {
              setIsAdding(false);
            });
          }}
        >
          {isAdding ? "Adding..." : "Add to chat"}
        </button>
        {!thread.isResolved && onResolveReviewThread ? (
          <button
            type="button"
            className="ghost diff-viewer-inline-thread-action"
            disabled={isResolving}
            onClick={() => {
              setIsResolving(true);
              Promise.resolve(onResolveReviewThread(thread.id)).finally(() => {
                setIsResolving(false);
              });
            }}
          >
            {isResolving ? "Resolving..." : "Resolve"}
          </button>
        ) : null}
      </div>
      {isCollapsed ? null : (
        <div className="diff-viewer-inline-thread-comments">
          {thread.comments.map((comment) => {
            const author = comment.author?.login ?? "unknown";
            const createdAt = comment.createdAt
              ? formatRelativeTime(new Date(comment.createdAt).getTime())
              : null;
            return (
              <div key={comment.id} className="diff-viewer-inline-thread-comment">
                <div className="diff-viewer-inline-thread-meta">
                  <span>@{author}</span>
                  {createdAt ? <span>{createdAt}</span> : null}
                </div>
                <Markdown
                  value={comment.body.trim() || "_No comment body._"}
                  className="diff-viewer-pr-comment markdown"
                />
              </div>
            );
          })}
        </div>
      )}
      {!isCollapsed && onReplyReviewThread ? (
        <div className="diff-viewer-inline-thread-reply">
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Reply to thread"
            rows={3}
            disabled={isReplying}
          />
          <button
            type="button"
            className="ghost diff-viewer-inline-thread-action"
            disabled={!trimmedReply || isReplying}
            onClick={() => {
              if (!trimmedReply) {
                return;
              }
              setIsReplying(true);
              Promise.resolve(onReplyReviewThread(thread.id, trimmedReply))
                .then(() => setReply(""))
                .finally(() => {
                  setIsReplying(false);
                });
            }}
          >
            {isReplying ? "Replying..." : "Reply"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function reviewThreadAnnotationSide(thread: GitHubPullRequestReviewThread): AnnotationSide {
  return thread.diffSide === "LEFT" ? "deletions" : "additions";
}

function reviewThreadLineNumber(thread: GitHubPullRequestReviewThread) {
  return thread.line ?? thread.startLine ?? null;
}

function buildReviewThreadAnnotations(
  reviewThreads: GitHubPullRequestReviewThread[],
): ReviewThreadAnnotation[] {
  return reviewThreads.flatMap((thread) => {
    const lineNumber = reviewThreadLineNumber(thread);
    if (lineNumber === null) {
      return [];
    }
    return [
      {
        side: reviewThreadAnnotationSide(thread),
        lineNumber,
        metadata: { thread },
      },
    ];
  });
}

export const DiffCard = memo(function DiffCard({
  entry,
  isSelected,
  diffStyle,
  isLoading,
  ignoreWhitespaceChanges,
  showRevert,
  onRequestRevert,
  interactiveSelectionEnabled,
  selectedLines = null,
  onSelectedLinesChange,
  onLineAction,
  reviewActions = [],
  onRunReviewAction,
  onClearSelection,
  pullRequestReviewLaunching = false,
  pullRequestReviewThreadId = null,
  reviewThreads = [],
  onReplyReviewThread,
  onResolveReviewThread,
  onAddReviewThreadToChat,
}: DiffCardProps) {
  const displayPath = entry.displayPath ?? entry.path;
  const { name: fileName, dir } = useMemo(
    () => splitPath(displayPath),
    [displayPath],
  );
  const displayDir = dir ? `${dir}/` : "";
  const fallbackLanguage = useMemo(
    () => languageFromPath(displayPath),
    [displayPath],
  );

  const fileDiff = useMemo(() => {
    if (!entry.diff.trim()) {
      return null;
    }
    const patch = parsePatchFiles(entry.diff);
    const parsed = patch[0]?.files[0];
    if (!parsed) {
      return null;
    }
    const normalizedName = normalizePatchName(parsed.name || displayPath);
    const normalizedPrevName = parsed.prevName
      ? normalizePatchName(parsed.prevName)
      : undefined;
    return {
      ...parsed,
      name: normalizedName,
      prevName: normalizedPrevName,
      oldLines: entry.oldLines,
      newLines: entry.newLines,
    } satisfies FileDiffMetadata;
  }, [displayPath, entry.diff, entry.newLines, entry.oldLines]);

  const placeholder = useMemo(() => {
    if (isLoading) {
      return "Loading diff...";
    }
    if (ignoreWhitespaceChanges && !entry.diff.trim()) {
      return "No non-whitespace changes.";
    }
    return "Diff unavailable.";
  }, [entry.diff, ignoreWhitespaceChanges, isLoading]);

  const parsedLines = useMemo(() => {
    const parsed = parseDiff(entry.diff);
    if (parsed.length > 0) {
      return parsed;
    }
    return parseRawDiffLines(entry.diff);
  }, [entry.diff]);

  const hasSelectableLines = useMemo(
    () => parsedLines.some(isSelectableLine),
    [parsedLines],
  );
  const useInteractiveDiff = interactiveSelectionEnabled && hasSelectableLines;
  const lineActionEnabled =
    diffStyle === "unified" && Boolean(onLineAction) && hasSelectableLines;
  const reviewThreadAnnotations = useMemo(
    () => buildReviewThreadAnnotations(reviewThreads),
    [reviewThreads],
  );

  const diffOptions = useMemo(
    () => ({
      diffStyle,
      hunkSeparators: "line-info" as const,
      overflow: "scroll" as const,
      unsafeCSS: DIFF_VIEWER_SCROLL_CSS,
      disableFileHeader: true,
      enableLineSelection: useInteractiveDiff,
      onLineSelected: useInteractiveDiff ? onSelectedLinesChange : undefined,
      enableHoverUtility: lineActionEnabled,
    }),
    [
      diffStyle,
      lineActionEnabled,
      onSelectedLinesChange,
      useInteractiveDiff,
    ],
  );

  return (
    <div
      data-diff-path={entry.path}
      className={`diff-viewer-item ${isSelected ? "active" : ""}`}
    >
      <div className="diff-viewer-header">
        <span className="diff-viewer-status" data-status={entry.status}>
          {entry.status}
        </span>
        <span className="diff-viewer-path" title={displayPath}>
          <span className="diff-viewer-name">{fileName}</span>
          {displayDir && <span className="diff-viewer-dir">{displayDir}</span>}
        </span>
        {showRevert && (
          <button
            type="button"
            className="diff-viewer-header-action diff-viewer-header-action--discard"
            title="Discard changes in this file"
            aria-label="Discard changes in this file"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRequestRevert?.(displayPath);
            }}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        )}
      </div>
      {useInteractiveDiff && selectedLines && reviewActions.length > 0 ? (
        <div className="diff-viewer-review-actions" role="toolbar" aria-label="PR selection actions">
          {reviewActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="ghost diff-viewer-review-action"
              disabled={pullRequestReviewLaunching}
              onClick={() => {
                if (!onRunReviewAction) {
                  return;
                }
                void onRunReviewAction(action.intent, parsedLines, selectedLines);
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            className="ghost diff-viewer-review-action"
            onClick={onClearSelection}
          >
            Clear
          </button>
          {pullRequestReviewThreadId ? (
            <span className="diff-viewer-review-thread">
              Last review thread: {pullRequestReviewThreadId}
            </span>
          ) : null}
        </div>
      ) : null}
      {entry.diff.trim().length > 0 && fileDiff ? (
        <div className="diff-viewer-output diff-viewer-output-flat">
          <FileDiff<ReviewThreadAnnotationMetadata>
            fileDiff={fileDiff}
            options={diffOptions}
            lineAnnotations={reviewThreadAnnotations}
            renderAnnotation={(annotation) => (
              <ReviewThreadCard
                thread={annotation.metadata.thread}
                onReplyReviewThread={onReplyReviewThread}
                onResolveReviewThread={onResolveReviewThread}
                onAddReviewThreadToChat={onAddReviewThreadToChat}
              />
            )}
            selectedLines={useInteractiveDiff ? selectedLines : null}
            renderHoverUtility={
              lineActionEnabled
                ? (getHoveredLine) => (
                    <button
                      type="button"
                      className="diff-viewer-line-action-button"
                      aria-label="Ask for changes on hovered line"
                      title="Ask for changes on this line"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const resolved = resolveParsedLineForHover(
                          parsedLines,
                          getHoveredLine() as HoveredDiffLine,
                        );
                        if (!resolved) {
                          return;
                        }
                        onLineAction?.(resolved.line, resolved.index);
                      }}
                    >
                      +
                    </button>
                  )
                : undefined
            }
            style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
          />
        </div>
      ) : entry.diff.trim().length > 0 && parsedLines.length > 0 ? (
        <div className="diff-viewer-output diff-viewer-output-flat diff-viewer-output-raw">
          {parsedLines.map((line, index) => {
            const highlighted = highlightLine(
              line.text,
              isFallbackRawDiffLineHighlightable(line.type)
                ? fallbackLanguage
                : null,
            );
            const lineThreads = reviewThreads.filter((thread) => {
              const lineNumber = reviewThreadLineNumber(thread);
              if (lineNumber === null || !isSelectableLine(line)) {
                return false;
              }
              if (reviewThreadAnnotationSide(thread) === "deletions") {
                return line.oldLine === lineNumber;
              }
              return line.newLine === lineNumber;
            });

            return (
              <div key={index}>
                <div
                  className={`diff-viewer-raw-line diff-viewer-raw-line-${line.type}`}
                >
                  <span
                    className="diff-line-content"
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                </div>
                {lineThreads.length > 0 ? (
                  <div className="diff-viewer-inline-threads">
                    {lineThreads.map((thread) => (
                      <ReviewThreadCard
                        key={thread.id}
                        thread={thread}
                        onReplyReviewThread={onReplyReviewThread}
                        onResolveReviewThread={onResolveReviewThread}
                        onAddReviewThreadToChat={onAddReviewThreadToChat}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="diff-viewer-placeholder">{placeholder}</div>
      )}
    </div>
  );
});
