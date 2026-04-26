// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { WorktreeSection } from "./WorktreeSection";

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
});
