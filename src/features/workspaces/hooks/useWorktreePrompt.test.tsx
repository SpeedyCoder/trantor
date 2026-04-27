// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { searchLinearIssues } from "../../../services/tauri";
import { useWorktreePrompt } from "./useWorktreePrompt";

vi.mock("../../../services/tauri", () => ({
  searchLinearIssues: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

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

  it("opens on Linear tab when Linear is configured", async () => {
    vi.mocked(searchLinearIssues).mockResolvedValueOnce({ total: 0, issues: [] });
    const addWorktreeAgent = vi.fn().mockResolvedValue(null);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        connectWorkspace,
        onSelectWorkspace,
        linearEnabled: true,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    expect(result.current.worktreePrompt?.activeTab).toBe("linear");
  });

  it("loads Linear issues even when parent callbacks are recreated during render", async () => {
    vi.mocked(searchLinearIssues).mockResolvedValue({
      total: 1,
      issues: [
        {
          id: "issue-1",
          identifier: "ENG-123",
          title: "Fix login",
          description: null,
          url: "https://linear.app/acme/issue/ENG-123/fix-login",
          branchName: "eng-123-fix-login",
          updatedAt: "2026-04-26T10:00:00.000Z",
          stateName: "Todo",
          teamKey: "ENG",
        },
      ],
    });
    const addWorktreeAgent = vi.fn().mockResolvedValue(null);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        connectWorkspace,
        onSelectWorkspace,
        linearEnabled: true,
        onError: () => undefined,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    await waitFor(() => {
      expect(searchLinearIssues).toHaveBeenCalledWith(parentWorkspace.id, "");
      expect(result.current.worktreePrompt?.linearLoading).toBe(false);
      expect(result.current.worktreePrompt?.linearIssues).toHaveLength(1);
    });
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
    expect(onWorktreeCreated).toHaveBeenCalledWith(
      worktreeWorkspace,
      parentWorkspace,
      undefined,
    );
  });

  it("blocks Linear issue selection without a branch name", async () => {
    const addWorktreeAgent = vi.fn().mockResolvedValue(null);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        connectWorkspace,
        onSelectWorkspace,
        linearEnabled: true,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    await act(async () => {
      await result.current.selectLinearIssue({
        id: "issue-1",
        identifier: "ENG-123",
        title: "Fix login",
        description: null,
        url: "https://linear.app/acme/issue/ENG-123/fix-login",
        branchName: null,
        updatedAt: "2026-04-26T10:00:00.000Z",
        stateName: "Todo",
        teamKey: "ENG",
      });
    });

    expect(addWorktreeAgent).not.toHaveBeenCalled();
    expect(result.current.worktreePrompt?.error).toBe(
      "Linear did not return a branch name for this issue.",
    );
  });

  it("creates a worktree from a Linear issue and passes a prefill prompt", async () => {
    const worktreeWorkspace: WorkspaceInfo = {
      id: "wt-1",
      name: "eng-123-fix-login",
      path: "/tmp/wt-1",
      connected: true,
      kind: "worktree",
      parentId: parentWorkspace.id,
      worktree: { branch: "eng-123-fix-login" },
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
        linearEnabled: true,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    await act(async () => {
      await result.current.selectLinearIssue({
        id: "issue-1",
        identifier: "ENG-123",
        title: "Fix login",
        description: "",
        url: "https://linear.app/acme/issue/ENG-123/fix-login",
        branchName: "eng-123-fix-login",
        updatedAt: "2026-04-26T10:00:00.000Z",
        stateName: "Todo",
        teamKey: "ENG",
      });
    });

    expect(addWorktreeAgent).toHaveBeenCalledWith(parentWorkspace, "eng-123-fix-login", {
      displayName: null,
      copyAgentsMd: true,
    });
    expect(onWorktreeCreated).toHaveBeenCalledWith(
      worktreeWorkspace,
      parentWorkspace,
      expect.objectContaining({
        prefillPrompt: expect.stringContaining("Work on Linear issue ENG-123: Fix login"),
      }),
    );
  });
});
