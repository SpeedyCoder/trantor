import { query } from "@anthropic-ai/claude-agent-sdk";

import { extractTextBlocks } from "./input.js";
import type {
  ClaudeModelInfo,
  ClaudeSdkLoader,
  ClaudeSdkMessage,
  ThreadRecord,
} from "../types/runtime.js";

export function extractAssistantDelta(message: ClaudeSdkMessage): string {
  const record = message as Record<string, any> | null;
  if (!record || record.type !== "stream_event") {
    return "";
  }
  const event = record.event as Record<string, any> | undefined;
  if (
    !event ||
    typeof event !== "object" ||
    event.type !== "content_block_delta"
  ) {
    return "";
  }
  const delta = event.delta as Record<string, any> | undefined;
  if (!delta || typeof delta !== "object") {
    return "";
  }
  return delta.type === "text_delta" && typeof delta.text === "string"
    ? delta.text
    : "";
}

export function extractAssistantMessageText(message: ClaudeSdkMessage): string {
  const record = message as Record<string, any> | null;
  if (!record || record.type !== "assistant") {
    return "";
  }
  const assistantMessage = record.message as Record<string, any> | undefined;
  return extractTextBlocks(assistantMessage?.content);
}

type RunClaudeTurnArgs = {
  thread: ThreadRecord;
  prompt: string;
  abortController: AbortController;
  loader?: ClaudeSdkLoader;
  onSessionReady: (sessionId: string) => Promise<void> | void;
  onDelta: (delta: string) => void;
};

export async function runClaudeTurn({
  thread,
  prompt,
  abortController,
  loader,
  onSessionReady,
  onDelta,
}: RunClaudeTurnArgs): Promise<{ text: string; aborted: boolean }> {
  let accumulated = "";
  let finalText = "";
  const sdk = loader ? await loader() : { query };

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
        abortController,
        tools: {
          type: "preset",
          preset: "claude_code",
        },
      },
    });

    for await (const message of stream) {
      const record = message as Record<string, any> | null;
      const data =
        (record?.data as Record<string, any> | undefined) ?? undefined;
      if (
        record?.type === "system" &&
        record.subtype === "init" &&
        typeof data?.session_id === "string"
      ) {
        await onSessionReady(data.session_id);
      } else if (
        record?.type === "system" &&
        record.subtype === "init" &&
        typeof data?.sessionId === "string"
      ) {
        await onSessionReady(data.sessionId);
      }

      const delta = extractAssistantDelta(message);
      if (delta) {
        accumulated += delta;
        onDelta(delta);
      }

      const assistantText = extractAssistantMessageText(message);
      if (assistantText) {
        finalText = assistantText;
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      return {
        text: finalText || accumulated,
        aborted: true,
      };
    }
    throw error;
  }

  return {
    text: finalText || accumulated,
    aborted: false,
  };
}

type ListClaudeModelsArgs = {
  cwd: string;
  loader?: ClaudeSdkLoader;
};

type ModelListResult = {
  data: Array<{
    model: string;
    displayName: string;
    description: string;
    supportedReasoningEfforts: Array<{
      reasoningEffort: string;
      description: string;
    }>;
    defaultReasoningEffort: string | null;
    isDefault: boolean;
  }>;
};

function toReasoningEfforts(model: ClaudeModelInfo): ModelListResult["data"][number]["supportedReasoningEfforts"] {
  return (model.supportedEffortLevels ?? []).map((reasoningEffort) => ({
    reasoningEffort,
    description: "",
  }));
}

export async function listClaudeModels({
  cwd,
  loader,
}: ListClaudeModelsArgs): Promise<ModelListResult> {
  const sdk = loader ? await loader() : { query };
  const control = sdk.query({
    prompt: "",
    options: {
      cwd,
      maxTurns: 1,
      includePartialMessages: false,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: ["project"],
    },
  });

  try {
    const models = await control.supportedModels();
    return {
      data: models.map((model, index) => ({
        model: model.value,
        displayName: model.displayName,
        description: model.description,
        supportedReasoningEfforts: toReasoningEfforts(model),
        defaultReasoningEffort: null,
        isDefault: index === 0,
      })),
    };
  } finally {
    await control.interrupt().catch(() => undefined);
  }
}
