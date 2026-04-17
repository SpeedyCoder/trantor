import path from "node:path";
import { randomUUID } from "node:crypto";

import { normalizeInputItems, parsePrompt } from "../claude/input.js";
import { listClaudeModels, runClaudeTurn } from "../claude/sdk.js";
import { ThreadRepository } from "../thread/repository.js";
import {
  buildAssistantMessageItem,
  buildThreadRecord,
  buildUserMessageItem,
  createThread,
  forkThread,
  now,
  summarizeThread,
} from "../thread/threadRecord.js";
import type {
  AppServerNotification,
  JsonRpcNotification,
  JsonRpcRequest,
} from "../types/jsonrpc.js";
import type { ClaudeSdkLoader, ThreadRecord } from "../types/runtime.js";
import {
  accountRateLimitsResult,
  accountReadResult,
  collaborationModesResult,
  emptyListResult,
} from "./staticResponses.js";
import { createJsonRpcServer } from "./jsonRpc.js";
import { notify, sendError, sendResult } from "./protocol.js";

type AppServerArgs = {
  workspaceId: string;
  dataDir: string;
  workspacePath?: string;
  send: (
    payload:
      | JsonRpcNotification
      | AppServerNotification
      | { id: unknown; result?: unknown; error?: unknown },
  ) => void;
  sdkLoader?: ClaudeSdkLoader;
};

type MethodHandler = (params: Record<string, unknown>) => Promise<unknown>;

function asParams(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function threadIdFromParams(params: Record<string, unknown>): string {
  const threadId = params.threadId ?? params.thread_id;
  return String(threadId ?? "");
}

export async function createAppServer({
  workspaceId,
  dataDir,
  workspacePath = process.env.CODEXMONITOR_WORKSPACE_PATH || process.cwd(),
  send,
  sdkLoader,
}: AppServerArgs) {
  const stateDir = path.join(dataDir, workspaceId);
  const repository = new ThreadRepository(stateDir);
  await repository.init();
  const activeRuns = new Map<string, AbortController>();

  async function getThreadOrThrow(threadId: string): Promise<ThreadRecord> {
    const thread = await repository.get(threadId);
    if (!thread) {
      throw new Error("thread not found");
    }
    return thread;
  }

  async function runTurn(params: Record<string, unknown>) {
    const thread = await getThreadOrThrow(threadIdFromParams(params));
    if (activeRuns.has(thread.id)) {
      throw new Error("thread already processing");
    }

    const turnId = randomUUID();
    const userItemId = randomUUID();
    const agentItemId = randomUUID();
    const inputItems = normalizeInputItems(params.input);
    const prompt = parsePrompt(params);
    const requestedModel =
      typeof params.model === "string" && params.model.trim().length > 0
        ? params.model.trim()
        : null;
    if (requestedModel) {
      thread.modelId = `claude:${requestedModel}`;
    }

    const abortController = new AbortController();
    activeRuns.set(thread.id, abortController);

    const userItem = buildUserMessageItem(
      userItemId,
      prompt,
      turnId,
      inputItems,
    );
    thread.messages.push(userItem);
    thread.updatedAt = now();
    await repository.save(thread);

    send(notify("turn/started", { threadId: thread.id, turnId }));
    send(
      notify("thread/status/changed", {
        threadId: thread.id,
        status: "running",
      }),
    );
    send(
      notify("item/started", { threadId: thread.id, turnId, item: userItem }),
    );
    send(
      notify("item/completed", { threadId: thread.id, turnId, item: userItem }),
    );
    send(
      notify("item/started", {
        threadId: thread.id,
        turnId,
        item: { id: agentItemId, type: "agentMessage" },
      }),
    );

    try {
      const result = await runClaudeTurn({
        thread,
        prompt,
        abortController,
        loader: sdkLoader,
        onSessionReady: async (sessionId) => {
          thread.sdkSessionId = sessionId;
          await repository.save(thread);
        },
        onDelta: (delta) => {
          send(
            notify("item/agentMessage/delta", {
              threadId: thread.id,
              turnId,
              itemId: agentItemId,
              delta,
            }),
          );
        },
      });

      thread.updatedAt = now();
      if (result.text || !result.aborted) {
        const assistantItem = buildAssistantMessageItem(
          agentItemId,
          result.text,
          turnId,
        );
        thread.messages.push(assistantItem);
        send(
          notify("item/completed", {
            threadId: thread.id,
            turnId,
            item: assistantItem,
          }),
        );
      }
      await repository.save(thread);
      send(
        notify("turn/completed", {
          threadId: thread.id,
          turnId,
          status: result.aborted ? "interrupted" : "completed",
        }),
      );
      send(
        notify("thread/status/changed", {
          threadId: thread.id,
          status: "idle",
        }),
      );

      return {
        ok: true,
        threadId: thread.id,
        turnId,
        turn: {
          id: turnId,
          threadId: thread.id,
          status: result.aborted ? "interrupted" : "completed",
        },
      };
    } finally {
      activeRuns.delete(thread.id);
    }
  }

  const handlers: Record<string, MethodHandler> = {
    async initialize() {
      return { ok: true, protocolVersion: "2" };
    },
    async "thread/start"(params) {
      const requestedModel =
        typeof params.model === "string" && params.model.trim().length > 0
          ? `claude:${params.model.trim()}`
          : null;
      const thread = createThread(
        typeof params.cwd === "string" && params.cwd.trim().length > 0
          ? params.cwd
          : workspacePath,
        requestedModel,
      );
      await repository.save(thread);
      send(
        notify("thread/started", {
          threadId: thread.id,
          thread: summarizeThread(thread),
        }),
      );
      return { threadId: thread.id, thread: summarizeThread(thread) };
    },
    async "thread/resume"(params) {
      const thread = await getThreadOrThrow(threadIdFromParams(params));
      return { threadId: thread.id, thread: buildThreadRecord(thread) };
    },
    async "thread/read"(params) {
      const thread = await getThreadOrThrow(threadIdFromParams(params));
      return { thread: buildThreadRecord(thread), data: thread.messages };
    },
    async "thread/fork"(params) {
      const source = await getThreadOrThrow(threadIdFromParams(params));
      const clone = forkThread(source);
      await repository.save(clone);
      send(
        notify("thread/started", {
          threadId: clone.id,
          thread: summarizeThread(clone),
        }),
      );
      return { threadId: clone.id, thread: summarizeThread(clone) };
    },
    async "thread/list"() {
      const threads = await repository.list();
      return {
        data: threads.filter((thread) => !thread.archived).map(summarizeThread),
      };
    },
    async "thread/archive"(params) {
      const thread = await getThreadOrThrow(threadIdFromParams(params));
      thread.archived = true;
      thread.updatedAt = now();
      await repository.save(thread);
      send(notify("thread/archived", { threadId: thread.id }));
      return { ok: true };
    },
    async "thread/name/set"(params) {
      const thread = await getThreadOrThrow(threadIdFromParams(params));
      thread.name =
        typeof params.name === "string" && params.name.trim().length > 0
          ? params.name
          : typeof params.title === "string" && params.title.trim().length > 0
            ? params.title
            : thread.name;
      thread.updatedAt = now();
      await repository.save(thread);
      send(
        notify("thread/name/updated", {
          threadId: thread.id,
          name: thread.name,
        }),
      );
      return { ok: true };
    },
    async "thread/compact/start"() {
      return { ok: true, compacted: false };
    },
    async "model/list"() {
      return listClaudeModels({
        cwd: workspacePath,
        loader: sdkLoader,
      });
    },
    async "turn/start"(params) {
      return runTurn(params);
    },
    async "turn/steer"(params) {
      return runTurn(params);
    },
    async "turn/interrupt"(params) {
      const threadId = threadIdFromParams(params);
      activeRuns.get(threadId)?.abort();
      activeRuns.delete(threadId);
      send(notify("thread/status/changed", { threadId, status: "idle" }));
      return { ok: true };
    },
    async "experimentalFeature/list"() {
      return emptyListResult();
    },
    async "collaborationMode/list"() {
      return collaborationModesResult();
    },
    async "account/rateLimits/read"() {
      return accountRateLimitsResult();
    },
    async "account/read"() {
      return accountReadResult();
    },
    async "skills/list"() {
      return emptyListResult();
    },
    async "app/list"() {
      return emptyListResult();
    },
    async "review/start"() {
      return { ok: true, started: false };
    },
  };

  const server = createJsonRpcServer({
    async handleRequest(request: JsonRpcRequest) {
      const handler = handlers[request.method];
      if (!handler) {
        if (Object.prototype.hasOwnProperty.call(request, "id")) {
          send(
            sendError(
              request.id ?? null,
              `Unsupported method: ${request.method}`,
            ),
          );
        } else {
          send(
            notify("error", {
              message: `Unsupported method: ${request.method}`,
            }),
          );
        }
        return;
      }

      try {
        const result = await handler(asParams(request.params));
        if (Object.prototype.hasOwnProperty.call(request, "id")) {
          send(sendResult(request.id ?? null, result));
        }
        if (request.method === "initialize") {
          send(notify("initialized", {}));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (Object.prototype.hasOwnProperty.call(request, "id")) {
          send(sendError(request.id ?? null, message));
        } else {
          send(notify("error", { message }));
        }
      }
    },
  });

  return {
    repository,
    processLine: server.processLine,
  };
}
