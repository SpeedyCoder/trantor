import { ModelInfo, query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ReasoningEffort } from "../generated/ReasoningEffort.js";
import type { ModelListResponse } from "../generated/v2/ModelListResponse.js";
import type { Model } from "../generated/v2/Model.js";

function claudeExecutablePath(): string | undefined {
  const value = process.env.CLAUDE_CLI_PATH?.trim();
  return value ? value : undefined;
}

export function extractAssistantDelta(message: SDKMessage): string {
  if (message.type !== "stream_event") {
    return "";
  }
  const event = message.event;
  if (event.type !== "content_block_delta") {
    return "";
  }
  const delta = event.delta;
  if (!delta || typeof delta !== "object") {
    return "";
  }
  return delta.type === "text_delta" ? delta.text : "";
}

export function extractAssistantMessageText(message: SDKMessage): string {
  if (!message || message.type !== "assistant") {
    return "";
  }
  return message.message.content
    .map((block) => {
      return block.type === "text" ? block.text : "";
    })
    .filter(Boolean)
    .join("");
}

type RunClaudeTurnArgs = {
  thread: {
    cwd: string;
    sdkSessionId?: string | null;
  };
  prompt: string;
  model?: string;
  abortController: AbortController;
  onSessionReady: (sessionId: string) => Promise<void> | void;
  onDelta: (delta: string) => void;
};

export async function runClaudeTurn({
  thread,
  prompt,
  model,
  abortController,
  onSessionReady,
  onDelta,
}: RunClaudeTurnArgs): Promise<{ text: string; aborted: boolean }> {
  let accumulated = "";
  let finalText = "";

  try {
    const stream = query({
      prompt,
      options: {
        cwd: thread.cwd,
        model,
        pathToClaudeCodeExecutable: claudeExecutablePath(),
        resume: thread.sdkSessionId ?? undefined,
        maxTurns: 1,
        includePartialMessages: true,
        enableFileCheckpointing: true,
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
      if (message.type === "system" && message.subtype === "init") {
        await onSessionReady(message.session_id);
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
};

function toReasoningEffort(
  reasoningEffort: NonNullable<ModelInfo["supportedEffortLevels"]>[number],
): ReasoningEffort | null {
  switch (reasoningEffort) {
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return reasoningEffort;
    default:
      return null;
  }
}

function toReasoningEfforts(model: {
  supportedEffortLevels?: ModelInfo["supportedEffortLevels"];
}): Model["supportedReasoningEfforts"] {
  return (model.supportedEffortLevels ?? [])
    .map((reasoningEffort) => toReasoningEffort(reasoningEffort))
    .filter((reasoningEffort): reasoningEffort is ReasoningEffort =>
      Boolean(reasoningEffort),
    )
    .map((reasoningEffort) => ({
      reasoningEffort,
      description: "",
    }));
}

export async function listClaudeModels({
  cwd,
}: ListClaudeModelsArgs): Promise<ModelListResponse> {
  const control = query({
    prompt: "",
    options: {
      cwd,
      pathToClaudeCodeExecutable: claudeExecutablePath(),
      maxTurns: 1,
      permissionMode: "bypassPermissions",
    },
  });

  try {
    const models = await control.supportedModels();
    return {
      data: models.map<Model>((model) => ({
        id: model.value,
        model: model.value,
        upgrade: null,
        upgradeInfo: null,
        availabilityNux: null,
        displayName: model.displayName ?? "",
        description: model.description ?? "",
        hidden: false,
        supportedReasoningEfforts: toReasoningEfforts(model),
        defaultReasoningEffort: "none",
        inputModalities: ["text"],
        supportsPersonality: false,
        isDefault: false,
      })),
      nextCursor: null,
    };
  } finally {
    await control.interrupt().catch(() => undefined);
  }
}
