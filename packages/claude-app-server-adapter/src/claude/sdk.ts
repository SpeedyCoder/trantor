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
  systemPromptAppend?: string | null;
  abortController: AbortController;
  onSessionReady: (sessionId: string) => Promise<void> | void;
  onDelta: (delta: string) => void;
  onMessage?: (message: SDKMessage) => Promise<void> | void;
};

export async function runClaudeTurn({
  thread,
  prompt,
  model,
  systemPromptAppend,
  abortController,
  onSessionReady,
  onDelta,
  onMessage,
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
        ...(systemPromptAppend
          ? {
              systemPrompt: {
                type: "preset" as const,
                preset: "claude_code" as const,
                append: systemPromptAppend,
              },
            }
          : {}),
      },
    });

    for await (const message of stream) {
      await onMessage?.(message);

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

const GENERIC_CLAUDE_MODEL_IDS = new Set(["default", "sonnet", "haiku"]);

const FALLBACK_CLAUDE_MODELS = [
  {
    value: "default",
    displayName: "Opus 4.7",
    description: "Fallback Claude model while the Claude model list is unavailable.",
    supportedEffortLevels: ["low", "medium", "high", "xhigh"],
    isDefault: true,
  },
  {
    value: "sonnet",
    displayName: "Sonnet 4.6",
    description: "Fallback Claude model while the Claude model list is unavailable.",
    supportedEffortLevels: ["low", "medium", "high", "xhigh"],
    isDefault: false,
  },
  {
    value: "haiku",
    displayName: "Haiku 4.5",
    description: "Fallback Claude model while the Claude model list is unavailable.",
    isDefault: false,
  },
] as const;

type ClaudeModelLike = {
  value: string;
  displayName?: string;
  description?: string;
  supportedEffortLevels?: readonly NonNullable<ModelInfo["supportedEffortLevels"]>[number][];
  isDefault?: boolean;
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
    case "max":
      return "xhigh";
    default:
      return null;
  }
}

function toReasoningEfforts(model: {
  supportedEffortLevels?: readonly NonNullable<ModelInfo["supportedEffortLevels"]>[number][];
}): Model["supportedReasoningEfforts"] {
  return (model.supportedEffortLevels ?? [])
    .map((reasoningEffort) => toReasoningEffort(reasoningEffort))
    .filter((reasoningEffort): reasoningEffort is ReasoningEffort =>
      Boolean(reasoningEffort),
    )
    .filter((reasoningEffort, index, efforts) => efforts.indexOf(reasoningEffort) === index)
    .map((reasoningEffort) => ({
      reasoningEffort,
      description: "",
    }));
}

function defaultReasoningEffortForModel(
  supportedReasoningEfforts: Model["supportedReasoningEfforts"],
): ReasoningEffort {
  if (supportedReasoningEfforts.some((effort) => effort.reasoningEffort === "medium")) {
    return "medium";
  }
  return supportedReasoningEfforts[0]?.reasoningEffort ?? "none";
}

function toDisplayName(modelId: string, displayName: string | undefined): string {
  const trimmed = displayName?.trim() ?? "";
  if (trimmed.length > 0 && !GENERIC_CLAUDE_MODEL_IDS.has(modelId.toLowerCase())) {
    return trimmed;
  }
  return modelId;
}

function canonicalDisplayNameForAlias(model: ClaudeModelLike): string | null {
  const modelId = model.value.trim().toLowerCase();
  if (!GENERIC_CLAUDE_MODEL_IDS.has(modelId)) {
    return null;
  }
  const description = model.description?.trim() ?? "";
  const versionMatch = description.match(/^(Opus|Sonnet|Haiku)\s+(\d+(?:\.\d+)?)/i);
  if (versionMatch) {
    const family = versionMatch[1] ? versionMatch[1][0]?.toUpperCase() + versionMatch[1].slice(1).toLowerCase() : "";
    return `${family} ${versionMatch[2]}`;
  }
  const displayName = model.displayName?.trim() ?? "";
  if (
    displayName.length > 0 &&
    displayName.toLowerCase() !== modelId &&
    !displayName.toLowerCase().includes("recommended")
  ) {
    return displayName;
  }
  if (modelId === "default") {
    return "Opus";
  }
  return null;
}

function toModel(model: ClaudeModelLike): Model {
  const modelId = model.value.trim();
  const supportedReasoningEfforts = toReasoningEfforts(model);
  return {
    id: modelId,
    model: modelId,
    upgrade: null,
    upgradeInfo: null,
    availabilityNux: null,
    displayName:
      canonicalDisplayNameForAlias(model) ?? toDisplayName(modelId, model.displayName),
    description: model.description ?? "",
    hidden: false,
    supportedReasoningEfforts,
    defaultReasoningEffort: defaultReasoningEffortForModel(supportedReasoningEfforts),
    inputModalities: ["text"],
    supportsPersonality: false,
    isDefault: Boolean(model.isDefault),
  };
}

function normalizeClaudeModels(models: ClaudeModelLike[]): Model[] {
  const sourceModels = models.length > 0 ? models : [...FALLBACK_CLAUDE_MODELS];
  return sourceModels.map((model) => toModel(model));
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
      data: normalizeClaudeModels(models),
      nextCursor: null,
    };
  } finally {
    await control.interrupt().catch(() => undefined);
  }
}
