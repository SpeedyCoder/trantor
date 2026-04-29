// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorktreePrompt } from "./WorktreePrompt";

afterEach(() => {
  cleanup();
});

const baseProps = {
  workspaceName: "Repo",
  branch: "feature/new-worktree",
  onChange: vi.fn(),
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

describe("WorktreePrompt", () => {
  it("guards backdrop cancel while busy", () => {
    const onCancel = vi.fn();
    const { container, rerender } = render(
      <WorktreePrompt {...baseProps} onCancel={onCancel} isBusy />,
    );

    let backdrop = container.querySelector(".ds-modal-backdrop");
    expect(backdrop).toBeTruthy();
    if (!backdrop) {
      throw new Error("Expected worktree prompt backdrop");
    }
    fireEvent.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();

    rerender(<WorktreePrompt {...baseProps} onCancel={onCancel} isBusy={false} />);
    backdrop = container.querySelector(".ds-modal-backdrop");
    if (!backdrop) {
      throw new Error("Expected worktree prompt backdrop");
    }
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("handles Escape and Enter on branch input", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <WorktreePrompt
        {...baseProps}
        onCancel={onCancel}
        onConfirm={onConfirm}
        isBusy={false}
        branchSuggestions={[]}
      />,
    );

    const branchInput = screen.getByLabelText("Branch name");
    fireEvent.keyDown(branchInput, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
    });
    fireEvent.keyDown(branchInput, { key: "Enter" });

    return waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it("submits from the create button without first closing the branch menu", () => {
    const onConfirm = vi.fn();
    render(
      <WorktreePrompt
        {...baseProps}
        onConfirm={onConfirm}
        isBusy={false}
        branchSuggestions={[{ name: "feature/existing", lastCommit: Date.now() }]}
      />,
    );

    const createButton = screen.getByRole("button", { name: "Create" });
    expect(fireEvent.mouseDown(createButton)).toBe(false);
    fireEvent.click(createButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("always shows existing branches in manual mode", () => {
    render(
      <WorktreePrompt
        {...baseProps}
        branchSuggestions={[{ name: "feature/existing", lastCommit: Date.now() }]}
      />,
    );

    expect(screen.getByRole("button", { name: /feature\/existing/i })).toBeTruthy();
  });

  it("shows Linear issues on the Linear tab and selects an issue before create", () => {
    const onLinearIssueSelect = vi.fn();
    const issue = {
      id: "issue-1",
      identifier: "ENG-123",
      title: "Fix login",
      description: "Details",
      url: "https://linear.app/acme/issue/ENG-123/fix-login",
      branchName: "eng-123-fix-login",
      updatedAt: "2026-04-26T10:00:00.000Z",
      stateName: "Todo",
      stateColor: "#1f80ff",
      teamKey: "ENG",
    };
    const { rerender } = render(
      <WorktreePrompt
        {...baseProps}
        activeTab="linear"
        linearEnabled
        linearQuery=""
        linearIssues={[issue]}
        onLinearIssueSelect={onLinearIssueSelect}
      />,
    );

    expect(screen.getByRole("button", { name: "Create" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: /ENG-123/i }));

    expect(onLinearIssueSelect).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "ENG-123" }),
    );
    expect(screen.getByText("Todo").className).toContain(
      "worktree-linear-issue-status",
    );
    expect(screen.queryByText("ENG", { selector: ".worktree-linear-issue-meta span" })).toBeNull();
    rerender(
      <WorktreePrompt
        {...baseProps}
        activeTab="linear"
        linearEnabled
        linearQuery=""
        linearIssues={[issue]}
        selectedLinearIssueId={issue.id}
        onLinearIssueSelect={onLinearIssueSelect}
      />,
    );
    expect(screen.getByRole("button", { name: "Create" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("switches from Linear to Manual tab", () => {
    const onTabChange = vi.fn();
    render(
      <WorktreePrompt
        {...baseProps}
        activeTab="linear"
        linearEnabled
        onTabChange={onTabChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Manual" }));

    expect(onTabChange).toHaveBeenCalledWith("manual");
  });
});
