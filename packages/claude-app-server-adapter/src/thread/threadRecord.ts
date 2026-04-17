import { randomUUID } from "node:crypto";

import type {
  AgentMessageItem,
  AdapterInputItem,
  ThreadMessage,
  ThreadRecord,
  ThreadRecordResponse,
  ThreadSummary,
  ThreadTurn,
  UserMessageItem,
} from "../types/runtime.js";

export function now(): number {
  return Date.now();
}

export function buildUserMessageItem(
  itemId: string,
  prompt: string,
  turnId: string,
  inputItems: AdapterInputItem[] = [],
): UserMessageItem {
  return {
    id: itemId,
    type: "userMessage",
    turnId,
    content:
      inputItems.length > 0
        ? inputItems
        : prompt
          ? [{ type: "text", text: prompt }]
          : [],
  };
}

export function buildAssistantMessageItem(
  itemId: string,
  text: string,
  turnId: string,
): AgentMessageItem {
  return {
    id: itemId,
    type: "agentMessage",
    turnId,
    text,
  };
}

export function summarizeThread(thread: ThreadRecord): ThreadSummary {
  return {
    id: thread.id,
    name: thread.name,
    cwd: thread.cwd,
    modelId: thread.modelId,
    model: thread.modelId,
    archived: Boolean(thread.archived),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    source: { kind: "appServer" },
  };
}

export function buildThreadTurns(messages: ThreadMessage[]): ThreadTurn[] {
  const turns: ThreadTurn[] = [];
  const turnMap = new Map<string, ThreadTurn>();
  for (const message of messages) {
    const turnId = typeof message.turnId === "string" ? message.turnId.trim() : "";
    if (!turnId) {
      continue;
    }
    let turn = turnMap.get(turnId);
    if (!turn) {
      turn = { id: turnId, status: "completed", items: [] };
      turnMap.set(turnId, turn);
      turns.push(turn);
    }
    turn.items.push(message);
  }
  return turns;
}

export function buildThreadRecord(thread: ThreadRecord): ThreadRecordResponse {
  const previewSource = [...thread.messages]
    .reverse()
    .find((message) => message.type === "agentMessage" && message.text.trim().length > 0);

  return {
    ...summarizeThread(thread),
    preview: previewSource?.type === "agentMessage" ? previewSource.text : "",
    turns: buildThreadTurns(thread.messages),
  };
}

export function createThread(
  cwd: string,
  requestedModel: string | null,
  name = "New Claude thread",
): ThreadRecord {
  const timestamp = now();
  return {
    id: randomUUID(),
    name,
    cwd,
    modelId: requestedModel,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    sdkSessionId: null,
    messages: [],
  };
}

export function forkThread(source: ThreadRecord): ThreadRecord {
  return {
    ...source,
    id: randomUUID(),
    name: `${source.name} (fork)`,
    createdAt: now(),
    updatedAt: now(),
    archived: false,
    messages: source.messages.map((message) => structuredClone(message)),
  };
}
