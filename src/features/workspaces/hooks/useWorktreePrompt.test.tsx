// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorktreePrompt } from "./useWorktreePrompt";

const parentWorkspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Parent",
  path: "/tmp/ws-1",
  connected: true,
  kind: "main",
  settings: { sidebarCollapsed: false },
};

describe("useWorktreePrompt", () => {
  it("opens with a new branch name by default", () => {
    const addWorktreeAgent = vi.fn().mockResolvedValue(null);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    expect(result.current.worktreePrompt?.branch).toMatch(
      /^codex\/\d{4}-\d{2}-\d{2}-[a-z0-9]{4}$/,
    );
    expect(addWorktreeAgent).not.toHaveBeenCalled();
  });

  it("updates branch from the selector input", () => {
    const addWorktreeAgent = vi.fn().mockResolvedValue(null);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    act(() => {
      result.current.updateBranch("feature/existing");
    });

    expect(result.current.worktreePrompt?.branch).toBe("feature/existing");
    expect(result.current.worktreePrompt?.branchWasEdited).toBe(true);
    expect(addWorktreeAgent).not.toHaveBeenCalled();
  });

  it("creates a worktree named from the selected branch and runs creation hooks", async () => {
    const worktreeWorkspace: WorkspaceInfo = {
      id: "wt-1",
      name: "feature/existing",
      path: "/tmp/wt-1",
      connected: true,
      kind: "worktree",
      parentId: parentWorkspace.id,
      worktree: { branch: "feature/existing" },
      settings: { sidebarCollapsed: false },
    };
    const addWorktreeAgent = vi.fn().mockResolvedValue(worktreeWorkspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();
    const onWorktreeCreated = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        connectWorkspace,
        onSelectWorkspace,
        onWorktreeCreated,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    const branch = result.current.worktreePrompt?.branch;
    expect(branch).toBeTruthy();

    act(() => {
      result.current.updateBranch("feature/existing");
    });

    await act(async () => {
      await result.current.confirmPrompt();
    });

    expect(addWorktreeAgent).toHaveBeenCalledWith(parentWorkspace, "feature/existing", {
      displayName: null,
      copyAgentsMd: true,
    });
    expect(onSelectWorkspace).toHaveBeenCalledWith(worktreeWorkspace.id);
    expect(onWorktreeCreated).toHaveBeenCalledWith(worktreeWorkspace, parentWorkspace);
  });
});
