import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BranchInfo, LinearIssue } from "../../../types";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { BranchList } from "../../git/components/BranchList";
import { filterBranches } from "../../git/utils/branchSearch";
import type { WorktreePromptTab } from "../hooks/useWorktreePrompt";

type WorktreePromptProps = {
  workspaceName: string;
  activeTab?: WorktreePromptTab;
  linearEnabled?: boolean;
  linearQuery?: string;
  linearIssues?: LinearIssue[];
  linearLoading?: boolean;
  selectedLinearIssueId?: string | null;
  branch: string;
  branchWasEdited?: boolean;
  branchSuggestions?: BranchInfo[];
  error?: string | null;
  onTabChange?: (tab: WorktreePromptTab) => void;
  onLinearQueryChange?: (value: string) => void;
  onLinearIssueSelect?: (issue: LinearIssue) => void;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
};

function formatIssueDate(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(time);
}

function getFallbackStatusColor(stateName: string): string {
  const normalized = stateName.toLowerCase();
  if (
    normalized.includes("done") ||
    normalized.includes("qa") ||
    normalized.includes("quality")
  ) {
    return "var(--status-success)";
  }
  if (
    normalized.includes("progress") ||
    normalized.includes("review") ||
    normalized.includes("doing")
  ) {
    return "var(--status-warning)";
  }
  if (normalized.includes("backlog") || normalized.includes("todo")) {
    return "var(--border-accent)";
  }
  return "var(--status-unknown)";
}

function getStatusStyle(issue: LinearIssue): CSSProperties {
  const stateName = issue.stateName?.trim();
  const color = issue.stateColor?.trim() || (stateName ? getFallbackStatusColor(stateName) : "");
  if (!color) {
    return {};
  }
  return {
    "--worktree-linear-status-color": color,
  } as CSSProperties;
}

export function WorktreePrompt({
  workspaceName,
  activeTab = "manual",
  linearEnabled = false,
  linearQuery = "",
  linearIssues = [],
  linearLoading = false,
  selectedLinearIssueId = null,
  branch,
  branchWasEdited = false,
  branchSuggestions = [],
  error = null,
  onTabChange,
  onLinearQueryChange,
  onLinearIssueSelect,
  onChange,
  onCancel,
  onConfirm,
  isBusy = false,
}: WorktreePromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const branchContainerRef = useRef<HTMLDivElement | null>(null);
  const branchListRef = useRef<HTMLDivElement | null>(null);
  const [selectedBranchIndex, setSelectedBranchIndex] = useState(0);
  const [didNavigateBranches, setDidNavigateBranches] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const filteredBranches = useMemo(() => {
    const query = branchWasEdited ? branch : "";
    return filterBranches(branchSuggestions, query, { mode: "fuzzy", whenEmptyLimit: 8 });
  }, [branch, branchSuggestions, branchWasEdited]);

  useEffect(() => {
    setDidNavigateBranches(false);
    setSelectedBranchIndex(0);
  }, [filteredBranches.length]);

  useEffect(() => {
    const itemEl = branchListRef.current?.children[selectedBranchIndex] as
      | HTMLElement
      | undefined;
    if (typeof itemEl?.scrollIntoView === "function") {
      itemEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedBranchIndex]);

  const handleBranchSelect = (branchInfo: BranchInfo) => {
    onChange(branchInfo.name);
    requestAnimationFrame(() => {
      const input = branchContainerRef.current?.querySelector(
        "input",
      ) as HTMLInputElement | null;
      input?.focus();
    });
  };

  return (
    <ModalShell
      className="worktree-modal"
      ariaLabel="New worktree agent"
      onBackdropClick={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <div className="ds-modal-title worktree-modal-title">New worktree agent</div>
      <div className="ds-modal-subtitle worktree-modal-subtitle">
        Create a worktree under project "{workspaceName}".
      </div>
      {linearEnabled && (
        <div className="worktree-modal-tabs" role="tablist" aria-label="Worktree source">
          <button
            type="button"
            className={activeTab === "linear" ? "selected" : ""}
            role="tab"
            aria-selected={activeTab === "linear"}
            onClick={() => onTabChange?.("linear")}
            disabled={isBusy}
          >
            Linear
          </button>
          <button
            type="button"
            className={activeTab === "manual" ? "selected" : ""}
            role="tab"
            aria-selected={activeTab === "manual"}
            onClick={() => onTabChange?.("manual")}
            disabled={isBusy}
          >
            Manual
          </button>
        </div>
      )}
      <div className="worktree-modal-body">
        {linearEnabled && activeTab === "linear" ? (
          <div className="worktree-modal-pane">
            <label className="ds-modal-label worktree-modal-label" htmlFor="linear-issue-search">
              Linear issue
            </label>
            <input
              id="linear-issue-search"
              className="ds-modal-input worktree-modal-input"
              value={linearQuery}
              placeholder="Search assigned issues"
              onChange={(event) => onLinearQueryChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !isBusy) {
                  event.preventDefault();
                  onCancel();
                }
              }}
              disabled={isBusy}
              autoFocus
            />
            <div className="worktree-linear-list">
              {linearLoading && <div className="worktree-linear-empty">Loading issues...</div>}
              {!linearLoading && linearIssues.length === 0 && !error && (
                <div className="worktree-linear-empty">No assigned issues found.</div>
              )}
              {!linearLoading &&
                linearIssues.map((issue) => {
                  const selected = issue.id === selectedLinearIssueId;
                  return (
                    <button
                      key={issue.id}
                      type="button"
                      className={`worktree-linear-issue${selected ? " selected" : ""}`}
                      onClick={() => onLinearIssueSelect?.(issue)}
                      disabled={isBusy}
                      aria-pressed={selected}
                    >
                      <span className="worktree-linear-issue-main">
                        <span className="worktree-linear-issue-id">{issue.identifier}</span>
                        <span className="worktree-linear-issue-title">{issue.title}</span>
                      </span>
                      <span className="worktree-linear-issue-meta">
                        {issue.stateName && (
                          <span
                            className="worktree-linear-issue-status"
                            style={getStatusStyle(issue)}
                          >
                            {issue.stateName}
                          </span>
                        )}
                        <span>{formatIssueDate(issue.updatedAt)}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="worktree-modal-pane">
            <label className="ds-modal-label worktree-modal-label" htmlFor="worktree-branch">
              Branch name
            </label>
            <div className="worktree-modal-branch" ref={branchContainerRef}>
              <input
                id="worktree-branch"
                ref={inputRef}
                className="ds-modal-input worktree-modal-input"
                value={branch}
                onChange={(event) => {
                  setDidNavigateBranches(false);
                  onChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    if (!isBusy) {
                      onCancel();
                    }
                    return;
                  }

                  if (filteredBranches.length === 0) {
                    if (event.key === "Enter" && !isBusy) {
                      event.preventDefault();
                      onConfirm();
                    }
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setDidNavigateBranches(true);
                    setSelectedBranchIndex((prev) =>
                      prev < filteredBranches.length - 1 ? prev + 1 : prev,
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setDidNavigateBranches(true);
                    setSelectedBranchIndex((prev) => (prev > 0 ? prev - 1 : prev));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (didNavigateBranches) {
                      const picked = filteredBranches[selectedBranchIndex];
                      if (picked) {
                        handleBranchSelect(picked);
                        return;
                      }
                    }
                    if (!isBusy) {
                      onConfirm();
                    }
                  }
                }}
              />
              <BranchList
                branches={filteredBranches}
                currentBranch={null}
                selectedIndex={selectedBranchIndex}
                listClassName="worktree-modal-branch-list"
                listRef={branchListRef}
                itemClassName="worktree-modal-branch-item"
                itemLabelClassName="worktree-modal-branch-item-name"
                selectedItemClassName="selected"
                emptyClassName="worktree-modal-branch-empty"
                emptyText={
                  branch.trim().length > 0 ? "No matching branches" : "No branches found"
                }
                onMouseEnter={(index) => {
                  setDidNavigateBranches(true);
                  setSelectedBranchIndex(index);
                }}
                onSelect={handleBranchSelect}
              />
            </div>
          </div>
        )}
      </div>
      {error && <div className="ds-modal-error worktree-modal-error">{error}</div>}
      <div className="ds-modal-actions worktree-modal-actions">
        <button
          className="ghost ds-modal-button worktree-modal-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
          type="button"
          disabled={isBusy}
        >
          Cancel
        </button>
        <button
          className="primary ds-modal-button worktree-modal-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onConfirm}
          type="button"
          disabled={
            isBusy ||
            (linearEnabled && activeTab === "linear"
              ? selectedLinearIssueId === null
              : branch.trim().length === 0)
          }
        >
          Create
        </button>
      </div>
    </ModalShell>
  );
}
