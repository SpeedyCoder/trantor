import { randomUUID } from "node:crypto";

import { parsePrompt } from "../claude/input";
import { listClaudeModels, runClaudeTurn } from "../claude/sdk";
import { ClaudeRepository } from "../claude/types";
import {
  ThreadArchiveResponse,
  ThreadCompactStartResponse,
  ThreadForkResponse,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadSetNameResponse,
  Turn,
  TurnInterruptResponse,
  TurnStartResponse,
} from "../generated/v2";
import { createThread, forkThread, now } from "../thread/threadRecord";
import { TurnRecord } from "../thread/types";
import { Handlers, Send } from "../types/protocol";

function buildThreadResponse(
  thread: Awaited<ReturnType<ClaudeRepository["getThread"]>>,
  turns: Awaited<ReturnType<ClaudeRepository["getThreadTurns"]>>,
) {
  return { ...thread.data, turns: turns.map((turn) => turn.data) };
}

function buildResumeResponse(
  thread: Awaited<ReturnType<ClaudeRepository["getThread"]>>,
  turns: Awaited<ReturnType<ClaudeRepository["getThreadTurns"]>>,
): ThreadResumeResponse | ThreadForkResponse {
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
        onDelta: () => {},
      });

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
        send({
          method: "thread/started",
          params: { thread: { ...thread.data, turns: [] } },
        });
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
        send(response);
      },
      getThreadId: (message) => message.params.threadId,
    },
    "thread/read": {
      handle: async (message) => {
        const { thread, turns } = await getThreadWithTurns(
          message.params.threadId,
        );
        const response: ThreadReadResponse = {
          thread: buildThreadResponse(thread, turns),
        };
        send(response);
      },
      getThreadId: (message) => message.params.threadId,
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
        send(response);
      },
      getThreadId: (message) => message.params.threadId,
    },
    "thread/list": {
      handle: async () => {
        const threads = await repository.listThreads();
        const response: ThreadListResponse = {
          data: threads.map((thread) => ({ ...thread.data, turns: [] })),
          nextCursor: null,
        };
        send(response);
      },
    },
    "thread/archive": {
      handle: async (message) => {
        const thread = await repository.getThread(message.params.threadId);
        thread.archived = true;
        thread.data.updatedAt = now();
        await repository.saveThread(thread);
        const response: ThreadArchiveResponse = {};
        send(response);
        send({
          method: "thread/archived",
          params: { threadId: message.params.threadId },
        });
      },
      getThreadId: (message) => message.params.threadId,
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
        send(response);
        send({
          method: "thread/name/updated",
          params: {
            threadId: message.params.threadId,
            threadName: nextName ?? undefined,
          },
        });
      },
      getThreadId: (message) => message.params.threadId,
    },
    "thread/compact/start": {
      handle: async (message) => {
        const response: ThreadCompactStartResponse = {};
        send(response);
        send({
          method: "thread/compacted",
          params: {
            threadId: message.params.threadId,
            turnId: randomUUID(),
          },
        });
      },
      getThreadId: (message) => message.params.threadId,
    },
    "model/list": {
      handle: async () => {
        const response = await listClaudeModels({ cwd: workspacePath });
        send(response);
      },
    },
    "turn/start": {
      handle: async (message) => {
        const turn = await executeTurn(
          message.params.threadId,
          message.params as unknown as Record<string, unknown>,
        );
        const response: TurnStartResponse = { turn };
        send(response);
      },
      getThreadId: (message) => message.params.threadId,
    },
    "turn/steer": {
      handle: async (message) => {
        const turn = await executeTurn(
          message.params.threadId,
          message.params as unknown as Record<string, unknown>,
        );
        const response: TurnStartResponse = { turn };
        send(response);
      },
      getThreadId: (message) => message.params.threadId,
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
        send(response);
        send({
          method: "thread/status/changed",
          params: {
            threadId: message.params.threadId,
            status: thread.data.status,
          },
        });
      },
      getThreadId: (message) => message.params.threadId,
    },
  };
}
