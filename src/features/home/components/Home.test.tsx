// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

afterEach(() => {
  cleanup();
});

const baseProps = {
  onOpenSettings: vi.fn(),
  onAddWorkspace: vi.fn(),
  onAddWorkspaceFromUrl: vi.fn(),
  latestAgentRuns: [],
  isLoadingLatestAgents: false,
  onSelectThread: vi.fn(),
};

describe("Home", () => {
  it("renders latest agent runs and lets you open a thread", () => {
    const onSelectThread = vi.fn();
    render(
      <Home
        {...baseProps}
        latestAgentRuns={[
          {
            message: "Ship the dashboard refresh",
            timestamp: Date.now(),
            projectName: "Dashboard",
            groupName: "Frontend",
            workspaceId: "workspace-1",
            threadId: "thread-1",
            isProcessing: true,
          },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    expect(screen.getByText("Latest agents")).toBeTruthy();
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Frontend")).toBeTruthy();
    const message = screen.getByText("Ship the dashboard refresh");
    const card = message.closest("button");
    expect(card).toBeTruthy();
    if (!card) {
      throw new Error("Expected latest agent card button");
    }
    fireEvent.click(card);
    expect(onSelectThread).toHaveBeenCalledWith("workspace-1", "thread-1");
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("shows the empty state when there are no latest runs", () => {
    render(<Home {...baseProps} />);

    expect(screen.getByText("No agent activity yet")).toBeTruthy();
    expect(
      screen.getByText("Start a thread to see the latest responses here."),
    ).toBeTruthy();
    expect(screen.queryByText("Usage snapshot")).toBeNull();
  });
});
