// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { WorktreeSection } from "./WorktreeSection";

afterEach(() => {
  cleanup();
});

const worktree: WorkspaceInfo = {
  id: "wt-1",
  name: "Worktree One",
  path: "/tmp/worktree",
  connected: true,
  kind: "worktree",
  worktree: { branch: "feature/test" },
  settings: { sidebarCollapsed: false },
};

describe("WorktreeSection", () => {
  it("does not render older thread controls for worktrees", () => {
    render(
      <WorktreeSection
        worktrees={[worktree]}
        deletingWorktreeIds={new Set()}
        defaultWorktreeBranchFormat="trantor/{date}-{random}"
        activeAgentWorkspaceIds={new Set()}
        activeWorkspaceId={null}
        onSelectWorkspace={vi.fn()}
        onConnectWorkspace={vi.fn()}
        onShowWorktreeMenu={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Load older..." }),
    ).toBeNull();
  });

  it("trims the default branch prefix and splits hyphenated worktree names", () => {
    render(
      <WorktreeSection
        worktrees={[
          {
            ...worktree,
            name: "trantor/fix-sidebar-activity",
            worktree: { branch: "trantor/fix-sidebar-activity" },
          },
        ]}
        deletingWorktreeIds={new Set()}
        defaultWorktreeBranchFormat="trantor/{date}-{random}"
        activeAgentWorkspaceIds={new Set()}
        activeWorkspaceId={null}
        onSelectWorkspace={vi.fn()}
        onConnectWorkspace={vi.fn()}
        onShowWorktreeMenu={vi.fn()}
      />,
    );

    expect(screen.getByText("fix sidebar activity")).toBeTruthy();
    expect(screen.queryByText("trantor/fix-sidebar-activity")).toBeNull();
  });

  it("trims a custom default branch prefix from settings", () => {
    render(
      <WorktreeSection
        worktrees={[
          {
            ...worktree,
            name: "user/fix-sidebar-activity",
            worktree: { branch: "user/fix-sidebar-activity" },
          },
        ]}
        deletingWorktreeIds={new Set()}
        defaultWorktreeBranchFormat="user/{project}-{date}-{random}"
        activeAgentWorkspaceIds={new Set()}
        activeWorkspaceId={null}
        onSelectWorkspace={vi.fn()}
        onConnectWorkspace={vi.fn()}
        onShowWorktreeMenu={vi.fn()}
      />,
    );

    expect(screen.getByText("fix sidebar activity")).toBeTruthy();
    expect(screen.queryByText("user/fix-sidebar-activity")).toBeNull();
  });

  it("trims sanitized custom prefixes from workspace names", () => {
    render(
      <WorktreeSection
        worktrees={[
          {
            ...worktree,
            name: "user-fix-sidebar-activity",
            worktree: { branch: "user/fix-sidebar-activity" },
          },
        ]}
        deletingWorktreeIds={new Set()}
        defaultWorktreeBranchFormat="user/{project}-{date}-{random}"
        activeAgentWorkspaceIds={new Set()}
        activeWorkspaceId={null}
        onSelectWorkspace={vi.fn()}
        onConnectWorkspace={vi.fn()}
        onShowWorktreeMenu={vi.fn()}
      />,
    );

    expect(screen.getByText("fix sidebar activity")).toBeTruthy();
    expect(screen.queryByText("user-fix-sidebar-activity")).toBeNull();
  });
});
