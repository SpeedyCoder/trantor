import type { ModelOption } from "../../../types";

export function normalizeEffortValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractModelItems(response: unknown): unknown[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const record = response as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : null;

  const resultData = result?.data;
  if (Array.isArray(resultData)) {
    return resultData;
  }

  const topLevelData = record.data;
  if (Array.isArray(topLevelData)) {
    return topLevelData;
  }

  return [];
}

function stripRuntimePrefix(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("codex:")) {
    return trimmed.slice("codex:".length).trim();
  }
  if (trimmed.startsWith("claude:")) {
    return trimmed.slice("claude:".length).trim();
  }
  return trimmed;
}

function stringCandidates(...values: unknown[]): string[] {
  const candidates = new Set<string>();
  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    candidates.add(trimmed);
    candidates.add(stripRuntimePrefix(trimmed));
  });
  return Array.from(candidates);
}

function isUnavailableModelRecord(record: Record<string, unknown>): boolean {
  if (record.hidden === true) {
    return true;
  }
  if (typeof record.upgrade === "string" && record.upgrade.trim().length > 0) {
    return true;
  }
  return record.upgradeInfo !== undefined && record.upgradeInfo !== null;
}

export function unavailableModelIdsFromResponse(response: unknown): Set<string> {
  const unavailable = new Set<string>();
  extractModelItems(response).forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    if (!isUnavailableModelRecord(record)) {
      return;
    }
    stringCandidates(
      record.id,
      record.model,
      record.providerModelId,
      record.provider_model_id,
    ).forEach((candidate) => unavailable.add(candidate));
  });
  return unavailable;
}

function parseReasoningEfforts(item: Record<string, unknown>): ModelOption["supportedReasoningEfforts"] {
  const camel = item.supportedReasoningEfforts;
  if (Array.isArray(camel)) {
    return camel
      .map((effort) => {
        if (!effort || typeof effort !== "object") {
          return null;
        }
        const entry = effort as Record<string, unknown>;
        return {
          reasoningEffort: String(entry.reasoningEffort ?? entry.reasoning_effort ?? ""),
          description: String(entry.description ?? ""),
        };
      })
      .filter((effort): effort is { reasoningEffort: string; description: string } =>
        effort !== null,
      );
  }

  const snake = item.supported_reasoning_efforts;
  if (Array.isArray(snake)) {
    return snake
      .map((effort) => {
        if (!effort || typeof effort !== "object") {
          return null;
        }
        const entry = effort as Record<string, unknown>;
        return {
          reasoningEffort: String(entry.reasoningEffort ?? entry.reasoning_effort ?? ""),
          description: String(entry.description ?? ""),
        };
      })
      .filter((effort): effort is { reasoningEffort: string; description: string } =>
        effort !== null,
      );
  }

  return [];
}

export function parseModelListResponse(response: unknown): ModelOption[] {
  const items = extractModelItems(response);

  return items
    .map<ModelOption | null>((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (isUnavailableModelRecord(record)) {
        return null;
      }
      const modelSlug = String(record.model ?? record.id ?? "");
      const rawDisplayName = String(record.displayName || record.display_name || "");
      const displayName = rawDisplayName.trim().length > 0 ? rawDisplayName : modelSlug;
      return {
        id: String(record.id ?? record.model ?? ""),
        model: modelSlug,
        runtime:
          record.runtime === "claude"
            ? "claude"
            : record.runtime === "codex"
              ? "codex"
              : undefined,
        providerModelId:
          typeof record.providerModelId === "string"
            ? record.providerModelId
            : typeof record.provider_model_id === "string"
              ? record.provider_model_id
              : null,
        displayName,
        description: String(record.description ?? ""),
        supportedReasoningEfforts: parseReasoningEfforts(record),
        defaultReasoningEffort: normalizeEffortValue(
          record.defaultReasoningEffort ?? record.default_reasoning_effort,
        ),
        isDefault: Boolean(record.isDefault ?? record.is_default ?? false),
      };
    })
    .filter((model): model is ModelOption => model !== null);
}
