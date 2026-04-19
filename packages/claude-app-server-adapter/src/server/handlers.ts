import { randomUUID } from "node:crypto";

import { parsePrompt } from "../claude/input.js";
import { listClaudeModels, runClaudeTurn } from "../claude/sdk.js";
import { ClaudeRepository } from "../claude/types.js";
import {
  ThreadArchiveResponse,
  ThreadCompactStartResponse,
  ThreadForkResponse,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadStartResponse,
  ThreadSetNameResponse,
  Turn,
  TurnInterruptResponse,
  TurnStartResponse,
  TurnSteerResponse,
} from "../generated/v2/index.js";
import { createThread, forkThread, now } from "../thread/threadRecord.js";
import { TurnRecord } from "../thread/types.js";
import { Handlers, Send } from "../types/protocol.js";

function buildThreadResponse(
  thread: Awaited<ReturnType<ClaudeRepository["getThread"]>>,
  turns: Awaited<ReturnType<ClaudeRepository["getThreadTurns"]>>,
) {
  return { ...thread.data, turns: turns.map((turn) => turn.data) };
}

function buildResumeResponse(
  thread: Awaited<ReturnType<ClaudeRepository["getThread"]>>,
  turns: Awaited<ReturnType<ClaudeRepository["getThreadTurns"]>>,
): ThreadResumeResponse | ThreadForkResponse | ThreadStartResponse {
  return {
    thread: buildThreadResponse(thread, turns),
    model: thread.metadata.model ?? "",
    modelProvider: "anthropic",
    serviceTier: null,
    cwd: thread.data.cwd,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    sandbox: { type: "dangerFullAccess" },
    reasoningEffort: null,
  };
}

function buildTurn(status: Turn["status"]): Turn {
  return {
    id: randomUUID(),
    items: [],
    status,
    error: null,
  };
}

function buildAgentMessageItem(itemId: string, text: string) {
  return {
    type: "agentMessage" as const,
    id: itemId,
    text,
    phase: "final_answer" as const,
  };
}

function buildUserMessageItem(itemId: string, params: Record<string, unknown>) {
  const input = Array.isArray(params.input) ? params.input : [];
  if (input.length > 0) {
    return {
      type: "userMessage" as const,
      id: itemId,
      content: input,
    };
  }

  const prompt = parsePrompt(params);
  if (!prompt) {
    return null;
  }

  return {
    type: "userMessage" as const,
    id: itemId,
    content: [{ type: "text" as const, text: prompt, text_elements: [] }],
  };
}

export function newHandlers(
  workspacePath: string,
  repository: ClaudeRepository,
  send: Send,
): Handlers {
  const activeRuns = new Map<string, AbortController>();

  async function getThreadWithTurns(threadId: string) {
    const [thread, turns] = await Promise.all([
      repository.getThread(threadId),
      repository.getThreadTurns(threadId),
    ]);
    return { thread, turns };
  }

  async function persistThreadTurn(
    threadId: string,
    turns: TurnRecord<object>[],
    turn: TurnRecord<object>,
  ) {
    await repository.saveThreadTurns(threadId, [...turns, turn]);
  }

  async function executeTurn(
    threadId: string,
    params: Record<string, unknown>,
  ): Promise<Turn> {
    if (activeRuns.has(threadId)) {
      throw new Error("thread already processing");
    }

    const { thread, turns } = await getThreadWithTurns(threadId);
    const turnRecord: TurnRecord<object> = {
      data: buildTurn("inProgress"),
      metadata: {},
    };
    const userMessageItemId = randomUUID();
    const agentMessageItemId = randomUUID();
    const abortController = new AbortController();
    const requestedModel =
      typeof params.model === "string" && params.model.trim().length > 0
        ? params.model.trim()
        : null;

    if (requestedModel) {
      thread.metadata.model = requestedModel;
    }

    thread.data.status = { type: "active", activeFlags: [] };
    thread.data.updatedAt = now();
    activeRuns.set(threadId, abortController);

    await Promise.all([
      repository.saveThread(thread),
      persistThreadTurn(threadId, turns, turnRecord),
    ]);

    const userMessageItem = buildUserMessageItem(userMessageItemId, params);
    if (userMessageItem) {
      turnRecord.data.items = [userMessageItem];
      send({
        method: "item/completed",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          item: userMessageItem,
        },
      });
    }

    send({
      method: "turn/started",
      params: { threadId, turn: turnRecord.data },
    });
    send({
      method: "thread/status/changed",
      params: { threadId, status: thread.data.status },
    });

    try {
      const result = await runClaudeTurn({
        thread: {
          cwd: thread.data.cwd,
          sdkSessionId: thread.metadata.sessionId,
        },
        prompt: parsePrompt(params),
        model: requestedModel ?? undefined,
        abortController,
        onSessionReady: async (sessionId) => {
          thread.metadata.sessionId = sessionId;
          await repository.saveThread(thread);
        },
        onDelta: (delta) => {
          send({
            method: "item/agentMessage/delta",
            params: {
              threadId,
              turnId: turnRecord.data.id,
              itemId: agentMessageItemId,
              delta,
            },
          });
        },
      });

      if (result.text) {
        const agentMessageItem = buildAgentMessageItem(
          agentMessageItemId,
          result.text,
        );
        turnRecord.data.items = userMessageItem
          ? [...turnRecord.data.items, agentMessageItem]
          : [agentMessageItem];
        send({
          method: "item/completed",
          params: {
            threadId,
            turnId: turnRecord.data.id,
            item: agentMessageItem,
          },
        });
      }

      turnRecord.data = {
        ...turnRecord.data,
        status: result.aborted ? "interrupted" : "completed",
      };
    } catch (error) {
      turnRecord.data = {
        ...turnRecord.data,
        status: "failed",
        error: {
          message: error instanceof Error ? error.message : String(error),
          codexErrorInfo: null,
          additionalDetails: null,
        },
      };
      throw error;
    } finally {
      activeRuns.delete(threadId);
      thread.data.status = { type: "idle" };
      thread.data.updatedAt = now();

      await Promise.all([
        repository.saveThread(thread),
        persistThreadTurn(threadId, turns, turnRecord),
      ]);

      send({
        method: "turn/completed",
        params: { threadId, turn: turnRecord.data },
      });
      send({
        method: "thread/status/changed",
        params: { threadId, status: thread.data.status },
      });
    }

    return turnRecord.data;
  }

  return {
    "thread/start": {
      handle: async (message) => {
        const params = message.params;
        const thread = createThread(
          params.cwd && params.cwd.trim().length > 0
            ? params.cwd
            : workspacePath,
          {
            sessionId: "",
            model: message.params.model ?? null,
          },
        );
        await repository.saveThread(thread);
        const turns = await repository.getThreadTurns(thread.data.id);
        send({
          method: "thread/started",
          params: { thread: { ...thread.data, turns: [] } },
        });
        const response: ThreadStartResponse = buildResumeResponse(
          thread,
          turns,
        );
        return response;
      },
    },
    "thread/resume": {
      handle: async (message) => {
        const { thread, turns } = await getThreadWithTurns(
          message.params.threadId,
        );
        const response: ThreadResumeResponse = buildResumeResponse(
          thread,
          turns,
        );
        return response;
      },
    },
    "thread/read": {
      handle: async (message) => {
        const { thread, turns } = await getThreadWithTurns(
          message.params.threadId,
        );
        const response: ThreadReadResponse = {
          thread: buildThreadResponse(thread, turns),
        };
        return response;
      },
    },
    "thread/fork": {
      handle: async (message) => {
        const { thread, turns } = await getThreadWithTurns(
          message.params.threadId,
        );
        const forkedThread = forkThread(thread, (meta) => ({
          sessionId: "",
          model: meta.model,
        }));
        await Promise.all([
          repository.saveThread(forkedThread),
          repository.saveThreadTurns(forkedThread.data.id, turns),
        ]);
        const response: ThreadForkResponse = buildResumeResponse(
          forkedThread,
          turns,
        );
        return response;
      },
    },
    "thread/list": {
      handle: async () => {
        const threads = await repository.listThreads();
        const response: ThreadListResponse = {
          data: threads.map((thread) => ({ ...thread.data, turns: [] })),
          nextCursor: null,
        };
        return response;
      },
    },
    "thread/archive": {
      handle: async (message) => {
        const thread = await repository.getThread(message.params.threadId);
        thread.archived = true;
        thread.data.updatedAt = now();
        await repository.saveThread(thread);
        const response: ThreadArchiveResponse = {};
        send({
          method: "thread/archived",
          params: { threadId: message.params.threadId },
        });
        return response;
      },
    },
    "thread/name/set": {
      handle: async (message) => {
        const thread = await repository.getThread(message.params.threadId);
        const nextName =
          typeof message.params.name === "string" &&
          message.params.name.trim().length > 0
            ? message.params.name.trim()
            : thread.data.name;
        thread.data.name = nextName;
        thread.data.updatedAt = now();
        await repository.saveThread(thread);
        const response: ThreadSetNameResponse = {};
        send({
          method: "thread/name/updated",
          params: {
            threadId: message.params.threadId,
            threadName: nextName ?? undefined,
          },
        });
        return response;
      },
    },
    "thread/compact/start": {
      handle: async (message) => {
        const response: ThreadCompactStartResponse = {};
        send({
          method: "thread/compacted",
          params: {
            threadId: message.params.threadId,
            turnId: randomUUID(),
          },
        });
        return response;
      },
    },
    "model/list": {
      handle: async () => {
        const response = await listClaudeModels({ cwd: workspacePath });
        return response;
      },
    },
    "turn/start": {
      handle: async (message) => {
        const turn = await executeTurn(
          message.params.threadId,
          message.params as unknown as Record<string, unknown>,
        );
        const response: TurnStartResponse = { turn };
        return response;
      },
    },
    "turn/steer": {
      handle: async (message) => {
        const turn = await executeTurn(
          message.params.threadId,
          message.params as unknown as Record<string, unknown>,
        );
        const response: TurnSteerResponse = { turnId: turn.id };
        return response;
      },
    },
    "turn/interrupt": {
      handle: async (message) => {
        activeRuns.get(message.params.threadId)?.abort();
        activeRuns.delete(message.params.threadId);

        const thread = await repository.getThread(message.params.threadId);
        thread.data.status = { type: "idle" };
        thread.data.updatedAt = now();
        await repository.saveThread(thread);

        const response: TurnInterruptResponse = {};
        send({
          method: "thread/status/changed",
          params: {
            threadId: message.params.threadId,
            status: thread.data.status,
          },
        });
        return response;
      },
    },
  };
}
