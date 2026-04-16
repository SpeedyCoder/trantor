export type AgentRuntime = "codex" | "claude";

export const MODEL_RUNTIME_PREFIX = {
  codex: "codex:",
  claude: "claude:",
} as const;

export function runtimeForModelId(modelId: string | null | undefined): AgentRuntime | null {
  if (!modelId) {
    return null;
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.claude)) {
    return "claude";
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.codex)) {
    return "codex";
  }
  return modelId.toLowerCase().startsWith("claude-") ? "claude" : "codex";
}

export function providerModelIdForModelId(modelId: string | null | undefined): string | null {
  if (!modelId) {
    return null;
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.codex)) {
    return modelId.slice(MODEL_RUNTIME_PREFIX.codex.length);
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.claude)) {
    return modelId.slice(MODEL_RUNTIME_PREFIX.claude.length);
  }
  return modelId;
}
