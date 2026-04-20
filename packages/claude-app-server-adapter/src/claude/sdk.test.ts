import { describe, expect, it, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}));

import { runClaudeTurn } from "./sdk.js";

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
