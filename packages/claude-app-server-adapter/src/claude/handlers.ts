import { randomUUID } from "node:crypto";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { parsePrompt } from "./input.js";
import {
  extractAssistantMessageText,
  listClaudeModels,
  runClaudeTurn,
} from "./sdk.js";
import { ClaudeRepository } from "./types.js";
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
  type ThreadItem,
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

function buildCommandExecutionItem(
  itemId: string,
  cwd: string,
  command: string,
  output = "",
  status: "inProgress" | "completed" | "failed" = "inProgress",
  durationMs: number | null = null,
) {
  return {
    type: "commandExecution" as const,
    id: itemId,
    command,
    cwd,
    processId: null,
    status,
    commandActions: [],
    aggregatedOutput: output || null,
    exitCode: null,
    durationMs,
  };
}

function buildFileChangeItem(
  itemId: string,
  changes: Array<{
    path: string;
    kind: { type: "add" } | { type: "delete" } | { type: "update"; move_path: string | null };
    diff: string;
  }>,
  status: "inProgress" | "completed" | "failed" | "declined" = "inProgress",
) {
  return {
    type: "fileChange" as const,
    id: itemId,
    changes,
    status,
  };
}

function appendUniqueLine(existing: string, next: string) {
  const trimmed = next.trim();
  if (!trimmed) {
    return existing;
  }
  const lines = existing ? existing.split("\n") : [];
  if (lines.at(-1)?.trim() === trimmed) {
    return existing;
  }
  return existing ? `${existing}\n${trimmed}` : trimmed;
}

function appendRaw(existing: string, next: string) {
  if (!next) {
    return existing;
  }
  return `${existing}${next}`;
}

function formatJsonIfPossible(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

function normalizeToolName(name: string) {
  return name.trim().toLowerCase();
}

function isFileChangeTool(name: string) {
  return new Set(["edit", "multiedit", "write", "notebookedit"]).has(
    normalizeToolName(name),
  );
}

function getToolInputRecord(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function getToolPath(input: unknown) {
  const record = getToolInputRecord(input);
  if (!record) {
    return "";
  }
  for (const key of ["file_path", "path"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildSyntheticDiff(path: string, input: unknown) {
  const record = getToolInputRecord(input);
  if (!record) {
    return "";
  }

  const oldString =
    typeof record.old_string === "string" ? record.old_string : null;
  const newString =
    typeof record.new_string === "string" ? record.new_string : null;
  if (oldString !== null && newString !== null) {
    return [
      `--- ${path || "before"}`,
      `+++ ${path || "after"}`,
      "@@",
      ...oldString.split("\n").map((line) => `-${line}`),
      ...newString.split("\n").map((line) => `+${line}`),
    ].join("\n");
  }

  if (Array.isArray(record.edits)) {
    const editDiffs = record.edits
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return "";
        }
        const edit = entry as Record<string, unknown>;
        const editOld =
          typeof edit.old_string === "string" ? edit.old_string : null;
        const editNew =
          typeof edit.new_string === "string" ? edit.new_string : null;
        if (editOld === null || editNew === null) {
          return "";
        }
        return [
          "@@",
          ...editOld.split("\n").map((line) => `-${line}`),
          ...editNew.split("\n").map((line) => `+${line}`),
        ].join("\n");
      })
      .filter(Boolean);
    if (editDiffs.length > 0) {
      return [`--- ${path || "before"}`, `+++ ${path || "after"}`, ...editDiffs].join(
        "\n",
      );
    }
  }

  const content = typeof record.content === "string" ? record.content : null;
  if (content !== null) {
    return [`+++ ${path || "after"}`, ...content.split("\n").map((line) => `+${line}`)].join(
      "\n",
    );
  }

  return "";
}

function buildFileChangesFromTool(name: string, input: unknown) {
  const path = getToolPath(input);
  if (!path) {
    return [];
  }
  const record = getToolInputRecord(input);
  const normalizedName = normalizeToolName(name);
  const kind =
    normalizedName === "write" && typeof record?.content === "string"
      ? ({ type: "add" } as const)
      : ({ type: "update", move_path: null } as const);
  return [
    {
      path,
      kind,
      diff: buildSyntheticDiff(path, input),
    },
  ];
}

function taskItemId(taskId: string) {
  return `task-${taskId}`;
}

function toolItemId(toolUseId: string) {
  return `tool-${toolUseId}`;
}

function reasoningItemId(index: number) {
  return `reasoning-${index}`;
}

function buildReasoningItem(itemId: string) {
  return {
    type: "reasoning" as const,
    id: itemId,
    summary: [],
    content: [],
  };
}

function commandLabelFromToolUse(name: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return name;
  }
  const record = input as Record<string, unknown>;
  for (const key of ["file_path", "path", "query", "pattern", "command", "url"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return `${name} ${value.trim()}`;
    }
  }
  return name;
}

type ToolBlockState =
  | {
      itemType: "commandExecution";
      itemId: string;
      command: string;
    }
  | {
      itemType: "fileChange";
      itemId: string;
      toolName: string;
      changes: Array<{
        path: string;
        kind: { type: "add" } | { type: "delete" } | { type: "update"; move_path: string | null };
        diff: string;
      }>;
    };

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
    const abortController = new AbortController();
    const persistedItems: ThreadItem[] = [];
    const persistedIndexById = new Map<string, number>();
    const outputByItemId = new Map<string, string>();
    const toolBlockByIndex = new Map<number, ToolBlockState>();
    const reasoningBlockByIndex = new Map<number, string>();
    let currentAgentMessageItemId: string | null = null;
    let currentAgentMessageText = "";
    let sawCompletedAgentMessage = false;
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
    const upsertPersistedItem = (item: ThreadItem) => {
      const itemId = typeof item.id === "string" ? item.id : "";
      if (!itemId) {
        return;
      }
      const existingIndex = persistedIndexById.get(itemId);
      if (existingIndex === undefined) {
        persistedItems.push(item);
        persistedIndexById.set(itemId, persistedItems.length - 1);
      } else {
        persistedItems[existingIndex] = item;
      }
      turnRecord.data.items = [...persistedItems];
    };

    if (userMessageItem) {
      upsertPersistedItem(userMessageItem);
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

    const ensureCommandItemStarted = (itemId: string, command: string) => {
      if (persistedIndexById.has(itemId)) {
        return;
      }
      const item = buildCommandExecutionItem(itemId, thread.data.cwd, command);
      upsertPersistedItem(item);
      send({
        method: "item/started",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          item,
        },
      });
    };

    const ensureFileChangeItemStarted = (
      itemId: string,
      changes: Array<{
        path: string;
        kind: { type: "add" } | { type: "delete" } | { type: "update"; move_path: string | null };
        diff: string;
      }>,
    ) => {
      if (persistedIndexById.has(itemId)) {
        return;
      }
      const item = buildFileChangeItem(itemId, changes);
      upsertPersistedItem(item);
      send({
        method: "item/started",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          item,
        },
      });
    };

    const appendCommandOutput = (
      itemId: string,
      delta: string,
      mode: "line" | "raw" = "line",
    ) => {
      const currentOutput = outputByItemId.get(itemId) ?? "";
      const nextOutput =
        mode === "raw"
          ? appendRaw(currentOutput, delta)
          : appendUniqueLine(currentOutput, delta);
      if (!nextOutput || nextOutput === currentOutput) {
        return;
      }
      outputByItemId.set(itemId, nextOutput);
      const existingIndex = persistedIndexById.get(itemId);
      if (existingIndex !== undefined) {
        const current = persistedItems[existingIndex];
        if (current?.type === "commandExecution") {
          upsertPersistedItem({
            ...current,
            aggregatedOutput: nextOutput,
          });
        }
      }
      send({
        method: "item/commandExecution/outputDelta",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          itemId,
          delta: mode === "raw" ? delta : delta.trim(),
        },
      });
    };

    const completeCommandItem = (
      itemId: string,
      command: string,
      status: "completed" | "failed",
      extraOutput?: string,
      durationMs?: number | null,
      outputFormat: "text" | "json" = "text",
    ) => {
      const mergedOutput = appendUniqueLine(
        outputByItemId.get(itemId) ?? "",
        extraOutput ?? "",
      );
      const finalOutput =
        outputFormat === "json" ? formatJsonIfPossible(mergedOutput) : mergedOutput;
      if (finalOutput) {
        outputByItemId.set(itemId, finalOutput);
      }
      const item = buildCommandExecutionItem(
        itemId,
        thread.data.cwd,
        command,
        finalOutput,
        status,
        durationMs ?? null,
      );
      upsertPersistedItem(item);
      send({
        method: "item/completed",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          item,
        },
      });
    };

    const completeFileChangeItem = (
      itemId: string,
      changes: Array<{
        path: string;
        kind: { type: "add" } | { type: "delete" } | { type: "update"; move_path: string | null };
        diff: string;
      }>,
      status: "completed" | "failed" | "declined" = "completed",
    ) => {
      const item = buildFileChangeItem(itemId, changes, status);
      upsertPersistedItem(item);
      send({
        method: "item/completed",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          item,
        },
      });
    };

    const appendAgentMessageDelta = (delta: string) => {
      if (!delta) {
        return;
      }
      if (!currentAgentMessageItemId) {
        currentAgentMessageItemId = randomUUID();
        currentAgentMessageText = "";
      }
      currentAgentMessageText += delta;
      send({
        method: "item/agentMessage/delta",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          itemId: currentAgentMessageItemId,
          delta,
        },
      });
    };

    const completeAgentMessage = (text: string) => {
      const normalizedText = text.trim() ? text : currentAgentMessageText;
      if (!normalizedText) {
        currentAgentMessageItemId = null;
        currentAgentMessageText = "";
        return;
      }
      const itemId = currentAgentMessageItemId ?? randomUUID();
      const item = buildAgentMessageItem(itemId, normalizedText);
      upsertPersistedItem(item);
      send({
        method: "item/completed",
        params: {
          threadId,
          turnId: turnRecord.data.id,
          item,
        },
      });
      currentAgentMessageItemId = null;
      currentAgentMessageText = "";
      sawCompletedAgentMessage = true;
    };

    const handleClaudeMessage = async (message: SDKMessage) => {
      if (message.type === "assistant") {
        const assistantText = extractAssistantMessageText(message);
        if (assistantText) {
          completeAgentMessage(assistantText);
        }
        return;
      }

      if (message.type === "tool_progress") {
        const itemId = message.task_id
          ? taskItemId(message.task_id)
          : toolItemId(message.tool_use_id);
        ensureCommandItemStarted(itemId, message.tool_name);
        return;
      }

      if (message.type !== "system") {
        if (message.type === "stream_event") {
          const event = message.event;
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block.type === "tool_use") {
              const itemId = toolItemId(block.id);
              if (isFileChangeTool(block.name)) {
                const changes = buildFileChangesFromTool(block.name, block.input);
                toolBlockByIndex.set(event.index, {
                  itemType: "fileChange",
                  itemId,
                  toolName: block.name,
                  changes,
                });
                ensureFileChangeItemStarted(itemId, changes);
              } else {
                const command = commandLabelFromToolUse(block.name, block.input);
                toolBlockByIndex.set(event.index, {
                  itemType: "commandExecution",
                  itemId,
                  command,
                });
                ensureCommandItemStarted(itemId, command);
              }
              return;
            }
            if (block.type === "thinking") {
              const itemId = reasoningItemId(event.index);
              reasoningBlockByIndex.set(event.index, itemId);
              const item = buildReasoningItem(itemId);
              upsertPersistedItem(item);
              send({
                method: "item/started",
                params: {
                  threadId,
                  turnId: turnRecord.data.id,
                  item,
                },
              });
              return;
            }
          }

          if (event.type === "content_block_delta") {
            if (event.delta.type === "input_json_delta") {
              const toolBlock = toolBlockByIndex.get(event.index);
              if (toolBlock?.itemType === "commandExecution") {
                appendCommandOutput(
                  toolBlock.itemId,
                  event.delta.partial_json,
                  "raw",
                );
              }
              return;
            }
            if (event.delta.type === "thinking_delta") {
              const itemId = reasoningBlockByIndex.get(event.index);
              if (itemId) {
                send({
                  method: "item/reasoning/textDelta",
                  params: {
                    threadId,
                    turnId: turnRecord.data.id,
                    itemId,
                    contentIndex: 0,
                    delta: event.delta.thinking,
                  },
                });
              }
              return;
            }
          }

          if (event.type === "content_block_stop") {
            const toolBlock = toolBlockByIndex.get(event.index);
            if (toolBlock) {
              if (toolBlock.itemType === "commandExecution") {
                completeCommandItem(
                  toolBlock.itemId,
                  toolBlock.command,
                  "completed",
                  undefined,
                  undefined,
                  "json",
                );
              } else {
                completeFileChangeItem(toolBlock.itemId, toolBlock.changes);
              }
              toolBlockByIndex.delete(event.index);
              return;
            }
            const reasoningItem = reasoningBlockByIndex.get(event.index);
            if (reasoningItem) {
              const item = persistedItems[persistedIndexById.get(reasoningItem) ?? -1];
              if (item?.type === "reasoning") {
                send({
                  method: "item/completed",
                  params: {
                    threadId,
                    turnId: turnRecord.data.id,
                    item,
                  },
                });
              }
              reasoningBlockByIndex.delete(event.index);
              return;
            }
          }
        }
        return;
      }

      if (message.subtype === "task_started") {
        if (message.skip_transcript) {
          return;
        }
        ensureCommandItemStarted(
          taskItemId(message.task_id),
          message.description || message.prompt || message.task_type || "Task",
        );
        return;
      }

      if (message.subtype === "task_progress") {
        ensureCommandItemStarted(
          taskItemId(message.task_id),
          message.last_tool_name || message.description || "Task",
        );
        appendCommandOutput(
          taskItemId(message.task_id),
          message.summary || message.description,
        );
        return;
      }

      if (message.subtype === "task_notification") {
        if (message.skip_transcript) {
          return;
        }
        completeCommandItem(
          taskItemId(message.task_id),
          message.summary || "Task",
          message.status === "failed" ? "failed" : "completed",
          message.summary,
          message.usage?.duration_ms ?? null,
        );
        return;
      }

      if (message.subtype === "local_command_output") {
        const itemId = "local-command-output";
        ensureCommandItemStarted(itemId, "Local command output");
        appendCommandOutput(itemId, message.content);
        return;
      }

      if (message.subtype === "notification") {
        const itemId = "claude-notifications";
        ensureCommandItemStarted(itemId, "Claude activity");
        appendCommandOutput(itemId, message.text);
      }
    };

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
        onDelta: appendAgentMessageDelta,
        onMessage: handleClaudeMessage,
      });

      if (currentAgentMessageItemId || (!sawCompletedAgentMessage && result.text)) {
        completeAgentMessage(result.text);
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
