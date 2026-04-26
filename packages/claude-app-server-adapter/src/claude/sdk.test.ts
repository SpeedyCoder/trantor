import { describe, expect, it, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}));

import { listClaudeModels, runClaudeTurn } from "./sdk.js";

function createAsyncIterable<T>(values: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of values) {
        yield value;
      }
    },
  };
}

describe("runClaudeTurn", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("does not cap Claude turns during normal streamed runs", async () => {
    queryMock.mockReturnValue(
      createAsyncIterable([
        {
          type: "system",
          subtype: "init",
          session_id: "session-1",
        },
        {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: {
              type: "text_delta",
              text: "Hello",
            },
          },
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello from Claude" }],
          },
        },
      ]),
    );

    const onSessionReady = vi.fn();
    const onDelta = vi.fn();

    const result = await runClaudeTurn({
      thread: {
        cwd: "/tmp/workspace",
        sdkSessionId: "session-0",
      },
      prompt: "Say hello",
      abortController: new AbortController(),
      onSessionReady,
      onDelta,
    });

    expect(result).toEqual({
      text: "Hello from Claude",
      aborted: false,
    });
    expect(onSessionReady).toHaveBeenCalledWith("session-1");
    expect(onDelta).toHaveBeenCalledWith("Hello");
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Say hello",
        options: expect.not.objectContaining({
          maxTurns: expect.anything(),
        }),
      }),
    );
  });
});

describe("listClaudeModels", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("keeps Claude aliases selectable while showing versioned names", async () => {
    const interrupt = vi.fn().mockResolvedValue(undefined);
    queryMock.mockReturnValue({
      supportedModels: vi.fn().mockResolvedValue([
        {
          value: "default",
          displayName: "Default (recommended)",
          description: "Opus 4.7 with 1M context · Most capable for complex work",
          supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
        },
        {
          value: "sonnet",
          displayName: "Sonnet",
          description: "Sonnet 4.6 · Best for everyday tasks",
          supportedEffortLevels: ["low", "medium", "high", "max"],
        },
        {
          value: "haiku",
          displayName: "Haiku",
          description: "Haiku 4.5 · Fastest for quick answers",
        },
      ]),
      interrupt,
    });

    const response = await listClaudeModels({ cwd: "/tmp/workspace" });

    expect(response.data.map((model) => model.id)).toEqual([
      "default",
      "sonnet",
      "haiku",
    ]);
    expect(response.data.map((model) => model.displayName)).toEqual([
      "Opus 4.7",
      "Sonnet 4.6",
      "Haiku 4.5",
    ]);
    expect(response.data[0]?.supportedReasoningEfforts.map((effort) => effort.reasoningEffort)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(response.data[1]?.supportedReasoningEfforts.map((effort) => effort.reasoningEffort)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(response.data[0]?.defaultReasoningEffort).toBe("medium");
    expect(response.data[1]?.defaultReasoningEffort).toBe("medium");
    expect(interrupt).toHaveBeenCalled();
  });

  it("keeps concrete Claude models alongside aliases", async () => {
    queryMock.mockReturnValue({
      supportedModels: vi.fn().mockResolvedValue([
        { value: "default", displayName: "Default (recommended)" },
        {
          value: "sonnet-4.6",
          displayName: "Sonnet 4.6",
          supportedEffortLevels: ["low", "medium"],
        },
      ]),
      interrupt: vi.fn().mockResolvedValue(undefined),
    });

    const response = await listClaudeModels({ cwd: "/tmp/workspace" });

    expect(response.data).toEqual([
      expect.objectContaining({
        id: "default",
        model: "default",
        displayName: "Opus",
      }),
      expect.objectContaining({
        id: "sonnet-4.6",
        model: "sonnet-4.6",
        displayName: "Sonnet 4.6",
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "" },
          { reasoningEffort: "medium", description: "" },
        ],
      }),
    ]);
  });
});
