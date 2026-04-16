#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
if (args[0] !== "app-server") {
  console.error("Usage: claude-app-server-adapter app-server --workspace-id <id> --data-dir <path>");
  process.exit(1);
}

function argValue(flag, fallback = null) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

const workspaceId = argValue("--workspace-id", "workspace");
const dataDir = argValue("--data-dir", path.join(process.cwd(), ".claude-adapter"));
const workspacePath = process.env.CODEXMONITOR_WORKSPACE_PATH || process.cwd();
const stateDir = path.join(dataDir, workspaceId);
const stateFile = path.join(stateDir, "threads.json");

fs.mkdirSync(stateDir, { recursive: true });

function loadState() {
  if (!fs.existsSync(stateFile)) {
    return { threads: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return { threads: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

const state = loadState();
const activeRuns = new Map();

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function sendResult(id, result) {
  send({ id, result });
}

function sendError(id, message) {
  send({ id, error: { message } });
}

function notify(method, params = {}) {
  send({ method, params });
}

function now() {
  return Date.now();
}

function findThread(threadId) {
  return state.threads.find((thread) => thread.id === threadId) ?? null;
}

function persistThread(thread) {
  const index = state.threads.findIndex((entry) => entry.id === thread.id);
  if (index >= 0) {
    state.threads[index] = thread;
  } else {
    state.threads.push(thread);
  }
  saveState(state);
}

function summarizeThread(thread) {
  return {
    id: thread.id,
    name: thread.name,
    cwd: thread.cwd,
    modelId: thread.modelId ?? null,
    model: thread.modelId ?? null,
    archived: Boolean(thread.archived),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    source: { kind: "appServer" },
  };
}

function extractTextBlocks(content) {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      return typeof block.text === "string" ? block.text : "";
    })
    .filter(Boolean)
    .join("");
}

function normalizeInputItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const type = typeof entry.type === "string" ? entry.type : "";
      if (!type) {
        return null;
      }
      if (type === "text") {
        return typeof entry.text === "string" ? { type, text: entry.text } : null;
      }
      if (type === "image") {
        return typeof entry.url === "string" ? { type, url: entry.url } : null;
      }
      if (type === "localImage") {
        return typeof entry.path === "string" ? { type, path: entry.path } : null;
      }
      if (type === "mention") {
        return {
          type,
          ...(typeof entry.name === "string" ? { name: entry.name } : {}),
          ...(typeof entry.path === "string" ? { path: entry.path } : {}),
        };
      }
      if (type === "skill") {
        return typeof entry.name === "string" ? { type, name: entry.name } : null;
      }
      return null;
    })
    .filter(Boolean);
}

function promptFromInputItems(items) {
  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      if (item.type === "text" && typeof item.text === "string") {
        return item.text;
      }
      if (item.type === "skill" && typeof item.name === "string") {
        return `$${item.name}`;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildUserMessageItem(itemId, prompt, turnId, inputItems = null) {
  return {
    id: itemId,
    type: "userMessage",
    turnId,
    content:
      Array.isArray(inputItems) && inputItems.length > 0
        ? inputItems
        : prompt
          ? [
              {
                type: "text",
                text: prompt,
              },
            ]
          : [],
  };
}

function buildAssistantMessageItem(itemId, text, turnId) {
  return {
    id: itemId,
    type: "agentMessage",
    turnId,
    text,
  };
}

function buildThreadTurns(messages) {
  const turns = [];
  const turnMap = new Map();
  messages.forEach((message) => {
    const turnId =
      typeof message?.turnId === "string" && message.turnId.trim().length > 0
        ? message.turnId.trim()
        : null;
    if (!turnId) {
      return;
    }
    let turn = turnMap.get(turnId);
    if (!turn) {
      turn = {
        id: turnId,
        status: "completed",
        items: [],
      };
      turnMap.set(turnId, turn);
      turns.push(turn);
    }
    turn.items.push(message);
  });
  return turns;
}

function buildThreadRecord(thread) {
  const previewSource = [...thread.messages]
    .reverse()
    .find((message) => typeof message?.text === "string" && message.text.trim().length > 0);
  return {
    ...summarizeThread(thread),
    preview: previewSource?.text ?? "",
    turns: buildThreadTurns(thread.messages),
  };
}

function parsePrompt(params = {}) {
  const inputItems = normalizeInputItems(params.input);
  if (inputItems.length > 0) {
    return promptFromInputItems(inputItems);
  }
  const candidate =
    params.prompt ??
    params.text ??
    params.message ??
    params.input ??
    params.userMessage?.text ??
    params.message?.text ??
    params.messages?.find?.((entry) => entry?.role === "user")?.content ??
    "";
  if (typeof candidate === "string") {
    return candidate;
  }
  if (candidate && typeof candidate === "object" && typeof candidate.text === "string") {
    return candidate.text;
  }
  return JSON.stringify(candidate);
}

function extractAssistantDelta(message) {
  if (!message || typeof message !== "object") {
    return "";
  }
  if (message.type !== "stream_event") {
    return "";
  }
  const event = message.event;
  if (!event || typeof event !== "object") {
    return "";
  }
  if (event.type !== "content_block_delta") {
    return "";
  }
  const delta = event.delta;
  if (!delta || typeof delta !== "object") {
    return "";
  }
  return delta.type === "text_delta" && typeof delta.text === "string" ? delta.text : "";
}

function extractAssistantMessageText(message) {
  if (!message || typeof message !== "object" || message.type !== "assistant") {
    return "";
  }
  const assistantMessage = message.message;
  if (!assistantMessage || typeof assistantMessage !== "object") {
    return "";
  }
  return extractTextBlocks(assistantMessage.content);
}

async function getSdk() {
  return import("@anthropic-ai/claude-agent-sdk");
}

async function runTurn(method, params) {
  const threadId = params.threadId ?? params.thread_id;
  const thread = findThread(String(threadId ?? ""));
  if (!thread) {
    throw new Error("thread not found");
  }
  if (activeRuns.has(thread.id)) {
    throw new Error("thread already processing");
  }

  const sdk = await getSdk();
  const turnId = randomUUID();
  const userItemId = randomUUID();
  const itemId = randomUUID();
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

  const userItem = buildUserMessageItem(userItemId, prompt, turnId, inputItems);
  thread.messages.push(userItem);
  thread.updatedAt = now();
  persistThread(thread);

  notify("turn/started", { threadId: thread.id, turnId });
  notify("thread/status/changed", { threadId: thread.id, status: "running" });
  notify("item/started", {
    threadId: thread.id,
    turnId,
    item: userItem,
  });
  notify("item/completed", {
    threadId: thread.id,
    turnId,
    item: userItem,
  });
  notify("item/started", {
    threadId: thread.id,
    turnId,
    item: { id: itemId, type: "agentMessage" },
  });

  let accumulated = "";
  let finalText = "";
  try {
    const stream = sdk.query({
      prompt,
      options: {
        cwd: thread.cwd,
        resume: thread.sdkSessionId ?? undefined,
        maxTurns: 1,
        includePartialMessages: true,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        settingSources: ["project"],
      },
      signal: abortController.signal,
    });

    for await (const message of stream) {
      if (message?.type === "system" && message?.subtype === "init") {
        thread.sdkSessionId =
          message?.data?.session_id ?? message?.data?.sessionId ?? thread.sdkSessionId;
        persistThread(thread);
      }
      const delta = extractAssistantDelta(message);
      if (delta) {
        accumulated += delta;
        notify("item/agentMessage/delta", {
          threadId: thread.id,
          turnId,
          itemId,
          delta,
        });
      }
      const assistantText = extractAssistantMessageText(message);
      if (assistantText) {
        finalText = assistantText;
      }
    }
  } finally {
    activeRuns.delete(thread.id);
  }

  const completedText = finalText || accumulated;
  thread.updatedAt = now();
  thread.messages.push(buildAssistantMessageItem(itemId, completedText, turnId));
  persistThread(thread);

  notify("item/completed", {
    threadId: thread.id,
    turnId,
    item: {
      id: itemId,
      type: "agentMessage",
      text: completedText,
    },
  });
  notify("turn/completed", { threadId: thread.id, turnId });
  notify("thread/status/changed", { threadId: thread.id, status: "idle" });

  return {
    ok: true,
    threadId: thread.id,
    turnId,
    turn: {
      id: turnId,
      threadId: thread.id,
      status: "running",
    },
  };
}

async function handle(method, params = {}) {
  if (method === "initialize") {
    return { ok: true, protocolVersion: "2" };
  }
  if (method === "thread/start") {
    const requestedModel =
      typeof params.model === "string" && params.model.trim().length > 0
        ? `claude:${params.model.trim()}`
        : null;
    const thread = {
      id: randomUUID(),
      name: "New Claude thread",
      cwd: params.cwd || workspacePath,
      modelId: requestedModel,
      archived: false,
      createdAt: now(),
      updatedAt: now(),
      sdkSessionId: null,
      messages: [],
    };
    persistThread(thread);
    notify("thread/started", {
      threadId: thread.id,
      thread: summarizeThread(thread),
    });
    return { threadId: thread.id, thread: summarizeThread(thread) };
  }
  if (method === "thread/resume") {
    const thread = findThread(String(params.threadId ?? params.thread_id ?? ""));
    if (!thread) {
      throw new Error("thread not found");
    }
    return { threadId: thread.id, thread: buildThreadRecord(thread) };
  }
  if (method === "thread/read") {
    const thread = findThread(String(params.threadId ?? params.thread_id ?? ""));
    if (!thread) {
      throw new Error("thread not found");
    }
    return { thread: buildThreadRecord(thread), data: thread.messages };
  }
  if (method === "thread/fork") {
    const source = findThread(String(params.threadId ?? params.thread_id ?? ""));
    if (!source) {
      throw new Error("thread not found");
    }
    const forked = {
      ...source,
      id: randomUUID(),
      name: `${source.name} (fork)`,
      createdAt: now(),
      updatedAt: now(),
      archived: false,
      messages: [...source.messages],
    };
    persistThread(forked);
    notify("thread/started", {
      threadId: forked.id,
      thread: summarizeThread(forked),
    });
    return { threadId: forked.id, thread: summarizeThread(forked) };
  }
  if (method === "thread/list") {
    return {
      data: state.threads.filter((thread) => !thread.archived).map(summarizeThread),
    };
  }
  if (method === "thread/archive") {
    const thread = findThread(String(params.threadId ?? params.thread_id ?? ""));
    if (!thread) {
      throw new Error("thread not found");
    }
    thread.archived = true;
    thread.updatedAt = now();
    persistThread(thread);
    notify("thread/archived", { threadId: thread.id });
    return { ok: true };
  }
  if (method === "thread/name/set") {
    const thread = findThread(String(params.threadId ?? params.thread_id ?? ""));
    if (!thread) {
      throw new Error("thread not found");
    }
    thread.name = String(params.name ?? params.title ?? thread.name);
    thread.updatedAt = now();
    persistThread(thread);
    notify("thread/name/updated", { threadId: thread.id, name: thread.name });
    return { ok: true };
  }
  if (method === "model/list") {
    return {
      data: [
        {
          id: "claude-sonnet-4-20250514",
          model: "claude-sonnet-4-20250514",
          displayName: "Claude Sonnet 4",
          supportedReasoningEfforts: [],
          defaultReasoningEffort: null,
          isDefault: true,
        },
        {
          id: "claude-opus-4-20250514",
          model: "claude-opus-4-20250514",
          displayName: "Claude Opus 4",
          supportedReasoningEfforts: [],
          defaultReasoningEffort: null,
          isDefault: false,
        },
      ],
    };
  }
  if (method === "turn/start" || method === "turn/steer") {
    return runTurn(method, params);
  }
  if (method === "turn/interrupt") {
    const threadId = String(params.threadId ?? params.thread_id ?? "");
    activeRuns.get(threadId)?.abort();
    activeRuns.delete(threadId);
    notify("thread/status/changed", { threadId, status: "idle" });
    return { ok: true };
  }
  throw new Error(`Unsupported method: ${method}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line.trim()) {
    continue;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }
  if (!message?.method) {
    continue;
  }
  try {
    const result = await handle(message.method, message.params ?? {});
    if (Object.prototype.hasOwnProperty.call(message, "id")) {
      sendResult(message.id, result);
    }
    if (message.method === "initialize") {
      notify("initialized", {});
    }
  } catch (error) {
    if (Object.prototype.hasOwnProperty.call(message, "id")) {
      sendError(message.id, error instanceof Error ? error.message : String(error));
    } else {
      notify("error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
