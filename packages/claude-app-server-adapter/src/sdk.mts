import { extractTextBlocks } from "./input.mjs";
import type { ClaudeSdkLoader, ClaudeSdkMessage, ThreadRecord } from "./types.mjs";

export function extractAssistantDelta(message: ClaudeSdkMessage): string {
  const record = message as Record<string, any> | null;
  if (!record || record.type !== "stream_event") {
    return "";
  }
  const event = record.event as Record<string, any> | undefined;
  if (!event || typeof event !== "object" || event.type !== "content_block_delta") {
    return "";
  }
  const delta = event.delta as Record<string, any> | undefined;
  if (!delta || typeof delta !== "object") {
    return "";
  }
  return delta.type === "text_delta" && typeof delta.text === "string" ? delta.text : "";
}

export function extractAssistantMessageText(message: ClaudeSdkMessage): string {
  const record = message as Record<string, any> | null;
  if (!record || record.type !== "assistant") {
    return "";
  }
  const assistantMessage = record.message as Record<string, any> | undefined;
  return extractTextBlocks(assistantMessage?.content);
}

export async function loadClaudeSdk() {
  return (await import("@anthropic-ai/claude-agent-sdk")) as any;
}

type RunClaudeTurnArgs = {
  thread: ThreadRecord;
  prompt: string;
  signal: AbortSignal;
  loader?: ClaudeSdkLoader;
  onSessionReady: (sessionId: string) => Promise<void> | void;
  onDelta: (delta: string) => void;
};

export async function runClaudeTurn({
  thread,
  prompt,
  signal,
  loader = loadClaudeSdk,
  onSessionReady,
  onDelta,
}: RunClaudeTurnArgs): Promise<{ text: string; aborted: boolean }> {
  const sdk = await loader();
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
      signal,
    });

    for await (const message of stream) {
      const record = message as Record<string, any> | null;
      const data = (record?.data as Record<string, any> | undefined) ?? undefined;
      if (record?.type === "system" && record.subtype === "init" && typeof data?.session_id === "string") {
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
    if (signal.aborted) {
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
