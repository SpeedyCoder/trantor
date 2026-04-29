import { describe, expect, it, vi, beforeEach } from "vitest";

import { newHandlers } from "./handlers.js";
import type { ClaudeRepository } from "./types.js";
import type { TurnRecord } from "../thread/types.js";

vi.mock("./sdk.js", () => ({
  extractAssistantMessageText: vi.fn((message: { message?: { content?: Array<{ type?: string; text?: string }> } }) =>
    (message.message?.content ?? [])
      .map((block) => (block.type === "text" ? block.text ?? "" : ""))
      .join(""),
  ),
  listClaudeModels: vi.fn(),
  runClaudeTurn: vi.fn(),
}));

import { runClaudeTurn } from "./sdk.js";

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

  it("includes Claude model metadata in thread responses", async () => {
    const repository = createRepository();
    const handlers = newHandlers("/tmp/workspace", repository, vi.fn());

    const startResponse = await handlers["thread/start"]?.handle({
      id: 1,
      method: "thread/start",
      params: {
        cwd: "/tmp/workspace",
        model: "sonnet-4.5",
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      },
    });

    expect(startResponse).toMatchObject({
      thread: {
        model: "sonnet-4.5",
        modelProvider: "anthropic",
      },
      model: "sonnet-4.5",
      modelProvider: "anthropic",
    });

    const threadId = (startResponse as { thread?: { id?: string } })?.thread?.id ?? "";
    const resumeResponse = await handlers["thread/resume"]?.handle({
      id: 2,
      method: "thread/resume",
      params: { threadId, persistExtendedHistory: false },
    });
    const listResponse = await handlers["thread/list"]?.handle({
      id: 3,
      method: "thread/list",
      params: {},
    });

    expect(resumeResponse).toMatchObject({
      thread: {
        model: "sonnet-4.5",
        modelProvider: "anthropic",
      },
    });
    expect(listResponse).toMatchObject({
      data: [
        expect.objectContaining({
          model: "sonnet-4.5",
          modelProvider: "anthropic",
        }),
      ],
    });
  });

  it("emits separate Claude assistant messages and file changes during turn/start", async () => {
    vi.mocked(runClaudeTurn).mockImplementation(async ({ onDelta, onMessage }) => {
      onDelta("Let me inspect");
      onDelta(" this file.");
      await onMessage?.({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Let me inspect this file.", citations: [] }],
        } as never,
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000009",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_01D7FLrfh4GYq7yT1ULFeyMV",
            name: "Read",
            input: { file_path: "src/App.tsx" },
            caller: { type: "direct" },
          },
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000000",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: "{\"file_p",
          },
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000005",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: "ath\":\"src",
          },
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000005",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: "/App.tsx\"}",
          },
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000005",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_stop",
          index: 0,
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000006",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "toolu_01EDIT",
            name: "Edit",
            input: {},
            caller: { type: "direct" },
          },
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000010",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: {
            type: "input_json_delta",
            partial_json: "{\"file_path\":\"src/App.tsx\",",
          },
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000013",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: {
            type: "input_json_delta",
            partial_json: "\"old_string\":\"Hello\",\"new_string\":\"Hello world\"}",
          },
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000014",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "stream_event",
        event: {
          type: "content_block_stop",
          index: 1,
        },
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000011",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "system",
        subtype: "task_started",
        task_id: "task-1",
        description: "Run tests",
        uuid: "00000000-0000-0000-0000-000000000001",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "tool_progress",
        tool_use_id: "tool-1",
        tool_name: "Bash",
        parent_tool_use_id: null,
        elapsed_time_seconds: 1,
        task_id: "task-1",
        uuid: "00000000-0000-0000-0000-000000000002",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "system",
        subtype: "task_progress",
        task_id: "task-1",
        description: "Running tests",
        summary: "npm test",
        usage: {
          total_tokens: 0,
          tool_uses: 1,
          duration_ms: 25,
        },
        uuid: "00000000-0000-0000-0000-000000000003",
        session_id: "session-1",
      });
      onDelta("I updated");
      onDelta(" the file.");
      await onMessage?.({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "I updated the file.", citations: [] }],
        } as never,
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000012",
        session_id: "session-1",
      });
      await onMessage?.({
        type: "system",
        subtype: "task_notification",
        task_id: "task-1",
        status: "completed",
        output_file: "/tmp/out",
        summary: "Tests finished",
        usage: {
          total_tokens: 0,
          tool_uses: 1,
          duration_ms: 40,
        },
        uuid: "00000000-0000-0000-0000-000000000004",
        session_id: "session-1",
      });
      return { text: "I updated the file.", aborted: false };
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
          method: "item/started",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "commandExecution",
              command: "Read src/App.tsx",
              status: "inProgress",
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/commandExecution/outputDelta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: "{\"file_p",
          }),
        }),
        expect.objectContaining({
          method: "item/commandExecution/outputDelta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: "ath\":\"src",
          }),
        }),
        expect.objectContaining({
          method: "item/commandExecution/outputDelta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: "/App.tsx\"}",
          }),
        }),
        expect.objectContaining({
          method: "item/completed",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "commandExecution",
              command: "Read src/App.tsx",
              status: "completed",
              aggregatedOutput: '{\n  "file_path": "src/App.tsx"\n}',
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/started",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "fileChange",
              status: "inProgress",
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/completed",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "fileChange",
              status: "completed",
              changes: [
                expect.objectContaining({
                  path: "src/App.tsx",
                  diff: expect.stringMatching(
                    /diff --git a\/src\/App\.tsx b\/src\/App\.tsx[\s\S]*-Hello/,
                  ),
                }),
              ],
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/started",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "commandExecution",
              command: "Run tests",
              status: "inProgress",
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/commandExecution/outputDelta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: "npm test",
          }),
        }),
        expect.objectContaining({
          method: "item/completed",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "commandExecution",
              status: "completed",
              aggregatedOutput: expect.stringContaining("Tests finished"),
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/agentMessage/delta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: "Let me inspect",
          }),
        }),
        expect.objectContaining({
          method: "item/agentMessage/delta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: " this file.",
          }),
        }),
        expect.objectContaining({
          method: "item/completed",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "agentMessage",
              text: "Let me inspect this file.",
              phase: "final_answer",
            }),
          }),
        }),
        expect.objectContaining({
          method: "item/agentMessage/delta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: "I updated",
          }),
        }),
        expect.objectContaining({
          method: "item/agentMessage/delta",
          params: expect.objectContaining({
            threadId: "thread-1",
            delta: " the file.",
          }),
        }),
        expect.objectContaining({
          method: "item/completed",
          params: expect.objectContaining({
            threadId: "thread-1",
            item: expect.objectContaining({
              type: "agentMessage",
              text: "I updated the file.",
              phase: "final_answer",
            }),
          }),
        }),
      ]),
    );

    const turns = await repository.getThreadTurns("thread-1");
    expect(turns).toHaveLength(1);
    expect(turns[0]?.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "userMessage",
          content: [{ type: "text", text: "Say hello", text_elements: [] }],
        }),
        expect.objectContaining({
          type: "commandExecution",
          command: "Read src/App.tsx",
          status: "completed",
          aggregatedOutput: '{\n  "file_path": "src/App.tsx"\n}',
        }),
        expect.objectContaining({
          type: "commandExecution",
          status: "completed",
          aggregatedOutput: expect.stringContaining("npm test"),
        }),
        expect.objectContaining({
          type: "fileChange",
          status: "completed",
          changes: [
            expect.objectContaining({
              path: "src/App.tsx",
              diff: expect.stringContaining("+Hello world"),
            }),
          ],
        }),
        expect.objectContaining({
          type: "agentMessage",
          text: "Let me inspect this file.",
          phase: "final_answer",
        }),
        expect.objectContaining({
          type: "agentMessage",
          text: "I updated the file.",
          phase: "final_answer",
        }),
      ]),
    );
  });

  it("lists Claude collaboration modes", async () => {
    const handlers = newHandlers("/tmp/workspace", createRepository(), vi.fn());

    const response = await handlers["collaborationMode/list"]?.handle({
      id: 1,
      method: "collaborationMode/list",
      params: {},
    });

    expect(response).toEqual({
      data: [
        {
          name: "default",
          mode: "default",
          model: null,
          reasoning_effort: null,
        },
        {
          name: "plan",
          mode: "plan",
          model: null,
          reasoning_effort: null,
        },
      ],
    });
  });

  it("emits plan events without duplicating Claude plan output as an agent message", async () => {
    vi.mocked(runClaudeTurn).mockImplementation(async ({ onDelta, onMessage }) => {
      onDelta("<proposed_plan>\n");
      onDelta("Plan note\n\n");
      onDelta("1. Read the code\n");
      onDelta("2. Add tests\n");
      onDelta("</proposed_plan>");
      await onMessage?.({
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: "<proposed_plan>\nPlan note\n\n1. Read the code\n2. Add tests\n</proposed_plan>",
              citations: [],
            },
          ],
        } as never,
        parent_tool_use_id: null,
        uuid: "00000000-0000-0000-0000-000000000020",
        session_id: "session-1",
      });
      return {
        text: "<proposed_plan>\nPlan note\n\n1. Read the code\n2. Add tests\n</proposed_plan>",
        aborted: false,
      };
    });
    const repository = createRepository();
    const send = vi.fn();
    const handlers = newHandlers("/tmp/workspace", repository, send);

    await handlers["turn/start"]?.handle({
      id: 1,
      method: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "Plan this", text_elements: [] }],
        cwd: "/tmp/workspace",
        model: "sonnet",
        collaborationMode: {
          mode: "plan",
          settings: {
            model: "sonnet",
            reasoning_effort: null,
            developer_instructions: "Keep it short.",
          },
        },
      },
    });

    expect(runClaudeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPromptAppend: expect.stringContaining("You are in Trantor plan mode."),
      }),
    );
    expect(runClaudeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPromptAppend: expect.stringContaining("Keep it short."),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "item/plan/delta",
        params: expect.objectContaining({
          threadId: "thread-1",
          delta: expect.stringContaining("<proposed_plan>"),
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "item/completed",
        params: expect.objectContaining({
          threadId: "thread-1",
          item: expect.objectContaining({
            type: "plan",
            text: expect.stringContaining("Read the code"),
          }),
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "turn/plan/updated",
        params: expect.objectContaining({
          explanation: "Plan note",
          plan: [
            { step: "Read the code", status: "pending" },
            { step: "Add tests", status: "pending" },
          ],
        }),
      }),
    );
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: "item/agentMessage/delta",
      }),
    );

    const turns = await repository.getThreadTurns("thread-1");
    expect(turns[0]?.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "plan",
          text: expect.stringContaining("Add tests"),
        }),
      ]),
    );
    expect(turns[0]?.data.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agentMessage",
          text: expect.stringContaining("Read the code"),
        }),
      ]),
    );
  });
});
