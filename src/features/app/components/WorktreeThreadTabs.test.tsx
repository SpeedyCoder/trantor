// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import { WorktreeThreadTabs } from "./WorktreeThreadTabs";

const workspace: WorkspaceInfo = {
  id: "worktree-1",
  name: "Feature Worktree",
  path: "/tmp/feature",
  connected: true,
  kind: "worktree",
  parentId: "project-1",
  worktree: { branch: "feature/test" },
  settings: { sidebarCollapsed: false },
};

function thread(overrides: Partial<ThreadSummary> & Pick<ThreadSummary, "id" | "name">): ThreadSummary {
  return {
    updatedAt: 0,
    ...overrides,
  };
}

describe("WorktreeThreadTabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders agents from left to right by creation time", () => {
    render(
      <WorktreeThreadTabs
        workspace={workspace}
        threads={[
          thread({ id: "new", name: "Newest", updatedAt: 300, createdAt: 300 }),
          thread({ id: "old", name: "Oldest", updatedAt: 100, createdAt: 100 }),
          thread({ id: "mid", name: "Middle", updatedAt: 200, createdAt: 200 }),
        ]}
        activeThreadId="mid"
        onSelectThread={vi.fn()}
        onStartThread={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Oldest",
      "Middle",
      "Newest",
    ]);
  });

  it("starts a new agent from the add button", () => {
    const onStartThread = vi.fn();
    render(
      <WorktreeThreadTabs
        workspace={workspace}
        threads={[]}
        activeThreadId={null}
        onSelectThread={vi.fn()}
        onStartThread={onStartThread}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start a new thread in Feature Worktree" }));

    expect(onStartThread).toHaveBeenCalledWith("worktree-1");
  });
});
