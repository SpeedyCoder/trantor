import { describe, expect, it, vi, beforeEach } from "vitest";

import { newHandlers } from "./handlers.js";
import type { ClaudeRepository } from "../claude/types.js";
import type { TurnRecord } from "../thread/types.js";

vi.mock("../claude/sdk.js", () => ({
  listClaudeModels: vi.fn(),
  runClaudeTurn: vi.fn(),
}));

import { runClaudeTurn } from "../claude/sdk.js";

function createRepository(): ClaudeRepository {
  const thread = {
    archived: false,
    metadata: { sessionId: "", model: null },
    data: {
      id: "thread-1",
      name: "Thread",
      cwd: "/tmp/workspace",
      createdAt: 1,
      updatedAt: 1,
      preview: "",
      ephemeral: false,
      modelProvider: "",
      status: { type: "idle" as const },
      path: null,
      cliVersion: "",
      source: "appServer" as const,
      agentNickname: null,
      agentRole: null,
      gitInfo: null,
    },
  };
  let turns: TurnRecord<object>[] = [];

  return {
    listThreads: async () => [thread],
    getThread: async (threadId: string) => {
      if (threadId !== thread.data.id) {
        throw new Error(`Thread not found: ${threadId}`);
      }
      return thread;
    },
    saveThread: async (nextThread) => {
      Object.assign(thread, nextThread);
    },
    getThreadTurns: async (threadId: string) => {
      if (threadId !== thread.data.id) {
        throw new Error(`Thread not found: ${threadId}`);
      }
      return turns;
    },
    saveThreadTurns: async (threadId: string, nextTurns: TurnRecord<object>[]) => {
      if (threadId !== thread.data.id) {
        throw new Error(`Thread not found: ${threadId}`);
      }
      turns = nextTurns;
    },
  };
}

describe("newHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits and persists Claude user and assistant responses during turn/start", async () => {
    vi.mocked(runClaudeTurn).mockImplementation(async ({ onDelta }) => {
      onDelta("Hello");
      onDelta(" world");
      return { text: "Hello world", aborted: false };
    });

    const repository = createRepository();
    const sent: unknown[] = [];
    const handlers = newHandlers("/tmp/workspace", repository, (payload) => {
      sent.push(payload);
    });

    const response = await handlers["turn/start"]?.handle({
      id: 1,
      method: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "Say hello", text_elements: [] }],
      },
    });

    expect(response).toMatchObject({
      turn: {
        status: "completed",
      },
    });

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "item/completed",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "userMessage",
              content: [{ type: "text", text: "Say hello", text_elements: [] }],
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/agentMessage/delta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: "Hello",
          }),
        }),
        expect.objectContaining({
          method: "item/agentMessage/delta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: " world",
          }),
        }),
        expect.objectContaining({
          method: "item/completed",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "agentMessage",
              text: "Hello world",
              phase: "final_answer",
            }),
          }),
        }),
      ]),
    );

    const turns = await repository.getThreadTurns("thread-1");
    expect(turns).toHaveLength(1);
    expect(turns[0]?.data.items).toEqual([
      expect.objectContaining({
        type: "userMessage",
        content: [{ type: "text", text: "Say hello", text_elements: [] }],
      }),
      expect.objectContaining({
        type: "agentMessage",
        text: "Hello world",
        phase: "final_answer",
      }),
    ]);
  });
});
