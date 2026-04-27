// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceSelection } from "./useWorkspaceSelection";

vi.mock("@sentry/react", () => ({
  metrics: {
    count: vi.fn(),
  },
}));

const parentWorkspace: WorkspaceInfo = {
  id: "project-1",
  name: "Project",
  path: "/tmp/project",
  connected: true,
  kind: "main",
  parentId: null,
  settings: { sidebarCollapsed: true },
};

const worktreeWorkspace: WorkspaceInfo = {
  id: "worktree-1",
  name: "feature/worktree",
  path: "/tmp/project-worktree",
  connected: true,
  kind: "worktree",
  parentId: parentWorkspace.id,
  worktree: { branch: "feature/worktree" },
  settings: { sidebarCollapsed: false },
};

describe("useWorkspaceSelection", () => {
  it("expands the parent project when selecting a worktree", () => {
    const updateWorkspaceSettings = vi.fn(async (workspaceId: string) => {
      const workspace = [parentWorkspace, worktreeWorkspace].find(
        (entry) => entry.id === workspaceId,
      );
      if (!workspace) {
        throw new Error(`Unknown workspace ${workspaceId}`);
      }
      return workspace;
    });
    const setActiveWorkspaceId = vi.fn();

    const { result } = renderHook(() =>
      useWorkspaceSelection({
        workspaces: [parentWorkspace, worktreeWorkspace],
        isCompact: false,
        activeWorkspaceId: parentWorkspace.id,
        setActiveTab: vi.fn(),
        setActiveWorkspaceId,
        updateWorkspaceSettings,
        setCenterMode: vi.fn(),
        setSelectedDiffPath: vi.fn(),
      }),
    );

    act(() => {
      result.current.selectWorkspace(worktreeWorkspace.id);
    });

    expect(updateWorkspaceSettings).toHaveBeenCalledWith(parentWorkspace.id, {
      sidebarCollapsed: false,
    });
    expect(setActiveWorkspaceId).toHaveBeenCalledWith(worktreeWorkspace.id);
  });
});
