// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useSidebarLayoutActions } from "./useSidebarLayoutActions";

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace One",
  path: "/tmp/workspace-one",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useSidebarLayoutActions", () => {
  it("keeps handlers referentially stable across unrelated rerenders", () => {
    const options = {
      openSettings: vi.fn(),
      resetPullRequestSelection: vi.fn(),
      clearDraftState: vi.fn(),
      clearDraftStateIfDifferentWorkspace: vi.fn(),
      selectHome: vi.fn(),
      exitDiffView: vi.fn(),
      selectWorkspace: vi.fn(),
      setActiveThreadId: vi.fn(),
      startThreadForWorkspace: vi.fn(async () => "thread-new"),
      threadsByWorkspace: {},
      connectWorkspace: vi.fn(async () => {}),
      isCompact: false,
      setActiveTab: vi.fn(),
      workspacesById: new Map([[workspace.id, workspace]]),
      updateWorkspaceSettings: vi.fn(async () => workspace),
      removeThread: vi.fn(),
      clearDraftForThread: vi.fn(),
      removeImagesForThread: vi.fn(),
      refreshThread: vi.fn(async () => {}),
      handleRenameThread: vi.fn(),
      removeWorkspace: vi.fn(async () => {}),
      removeWorktree: vi.fn(async () => {}),
      loadOlderThreadsForWorkspace: vi.fn(async () => {}),
      listThreadsForWorkspace: vi.fn(async () => {}),
    } as const;

    const { result, rerender } = renderHook(
      ({ tick }: { tick: number }) => {
        void tick;
        return useSidebarLayoutActions(options);
      },
      {
        initialProps: { tick: 0 },
      },
    );

    const firstRefs = {
      onSelectWorkspace: result.current.onSelectWorkspace,
      onSelectThread: result.current.onSelectThread,
      onDeleteThread: result.current.onDeleteThread,
      onLoadOlderThreads: result.current.onLoadOlderThreads,
    };

    rerender({ tick: 1 });

    expect(result.current.onSelectWorkspace).toBe(firstRefs.onSelectWorkspace);
    expect(result.current.onSelectThread).toBe(firstRefs.onSelectThread);
    expect(result.current.onDeleteThread).toBe(firstRefs.onDeleteThread);
    expect(result.current.onLoadOlderThreads).toBe(firstRefs.onLoadOlderThreads);
  });

  it("selects the first thread tab when a workspace is selected", async () => {
    const exitDiffView = vi.fn();
    const resetPullRequestSelection = vi.fn();
    const clearDraftStateIfDifferentWorkspace = vi.fn();
    const selectWorkspace = vi.fn();
    const setActiveThreadId = vi.fn();
    const startThreadForWorkspace = vi.fn(async () => "thread-new");
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection,
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace,
        selectHome: vi.fn(),
        exitDiffView,
        selectWorkspace,
        setActiveThreadId,
        startThreadForWorkspace,
        threadsByWorkspace: {
          "ws-1": [
            { id: "thread-2", name: "Second", updatedAt: 200, createdAt: 200 },
            { id: "thread-1", name: "First", updatedAt: 100, createdAt: 100 },
          ],
        },
        connectWorkspace: vi.fn(async () => {}),
        isCompact: false,
        setActiveTab: vi.fn(),
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        clearDraftForThread: vi.fn(),
        removeImagesForThread: vi.fn(),
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.onSelectWorkspace("ws-1");
    });

    expect(exitDiffView).toHaveBeenCalledTimes(1);
    expect(resetPullRequestSelection).toHaveBeenCalledTimes(1);
    expect(clearDraftStateIfDifferentWorkspace).toHaveBeenCalledWith("ws-1");
    expect(selectWorkspace).toHaveBeenCalledWith("ws-1");
    expect(setActiveThreadId).toHaveBeenCalledWith("thread-1", "ws-1");
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("creates a first thread tab when a selected workspace has none", async () => {
    const startThreadForWorkspace = vi.fn(async () => "thread-new");
    const setActiveThreadId = vi.fn();
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection: vi.fn(),
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace: vi.fn(),
        selectHome: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        setActiveThreadId,
        startThreadForWorkspace,
        threadsByWorkspace: { "ws-1": [] },
        connectWorkspace: vi.fn(async () => {}),
        isCompact: false,
        setActiveTab: vi.fn(),
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        clearDraftForThread: vi.fn(),
        removeImagesForThread: vi.fn(),
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.onSelectWorkspace("ws-1");
    });

    expect(setActiveThreadId).not.toHaveBeenCalled();
    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("switches to codex tab after connecting in compact mode", async () => {
    const connectWorkspace = vi.fn(async () => {});
    const setActiveTab = vi.fn();
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection: vi.fn(),
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace: vi.fn(),
        selectHome: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        setActiveThreadId: vi.fn(),
        startThreadForWorkspace: vi.fn(async () => "thread-new"),
        threadsByWorkspace: {},
        connectWorkspace,
        isCompact: true,
        setActiveTab,
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        clearDraftForThread: vi.fn(),
        removeImagesForThread: vi.fn(),
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.onConnectWorkspace(workspace);
    });

    expect(connectWorkspace).toHaveBeenCalledWith(workspace);
    expect(setActiveTab).toHaveBeenCalledWith("codex");
  });
});
