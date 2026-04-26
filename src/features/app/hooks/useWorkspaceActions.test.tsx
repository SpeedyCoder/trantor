/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";
import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceActions } from "./useWorkspaceActions";

vi.mock("@sentry/react", () => ({
  metrics: {
    count: vi.fn(),
  },
}));

describe("useWorkspaceActions telemetry", () => {
  const mainWorkspace: WorkspaceInfo = {
    id: "ws-1",
    name: "Workspace",
    path: "/tmp/workspace",
    connected: true,
    kind: "main",
    settings: {
      sidebarCollapsed: false,
    },
  };

  const worktreeWorkspace: WorkspaceInfo = {
    id: "wt-1",
    name: "Feature Branch",
    path: "/tmp/worktree",
    connected: true,
    kind: "worktree",
    settings: {
      sidebarCollapsed: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the worktree prompt when creating from a project", async () => {
    const exitDiffView = vi.fn();
    const openWorktreePrompt = vi.fn();

    const { result } = renderHook(() =>
      useWorkspaceActions({
        isCompact: false,
        addWorkspace: vi.fn(async () => null),
        addWorkspaceFromPath: vi.fn(async () => null),
        addWorkspaceFromGitUrl: vi.fn(async () => null),
        addWorkspacesFromPaths: vi.fn(async () => null),
        setActiveThreadId: vi.fn(),
        setActiveTab: vi.fn(),
        exitDiffView,
        selectWorkspace: vi.fn(),
        onStartNewAgentDraft: vi.fn(),
        openWorktreePrompt,
        composerInputRef: { current: null },
        onDebug: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleAddAgent(mainWorkspace);
    });

    expect(exitDiffView).toHaveBeenCalledTimes(1);
    expect(openWorktreePrompt).toHaveBeenCalledWith(mainWorkspace);
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it("records agent_created exactly once when adding an agent from a worktree", async () => {
    const setActiveThreadId = vi.fn();
    const startNewAgentDraft = vi.fn();

    const { result } = renderHook(() =>
      useWorkspaceActions({
        isCompact: false,
        addWorkspace: vi.fn(async () => null),
        addWorkspaceFromPath: vi.fn(async () => null),
        addWorkspaceFromGitUrl: vi.fn(async () => null),
        addWorkspacesFromPaths: vi.fn(async () => null),
        setActiveThreadId,
        setActiveTab: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        onStartNewAgentDraft: startNewAgentDraft,
        openWorktreePrompt: vi.fn(),
        composerInputRef: { current: null },
        onDebug: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleAddAgent(worktreeWorkspace);
    });

    expect(setActiveThreadId).toHaveBeenCalledWith(null, "wt-1");
    expect(startNewAgentDraft).toHaveBeenCalledWith("wt-1");
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledWith("agent_created", 1, {
      attributes: {
        workspace_id: "wt-1",
        thread_id: "draft",
      },
    });
  });
});
