import type { InputItem } from "./types.mjs";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function extractTextBlocks(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      const record = asRecord(block);
      return typeof record?.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("");
}

export function normalizeInputItems(value: unknown): InputItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }
      const type = typeof record?.type === "string" ? record.type : "";
      if (!type) {
        return null;
      }

      if (type === "text") {
        return typeof record.text === "string" ? { type, text: record.text } : null;
      }
      if (type === "image") {
        return typeof record.url === "string" ? { type, url: record.url } : null;
      }
      if (type === "localImage") {
        return typeof record.path === "string" ? { type, path: record.path } : null;
      }
      if (type === "mention") {
        return {
          type,
          ...(typeof record.name === "string" ? { name: record.name } : {}),
          ...(typeof record.path === "string" ? { path: record.path } : {}),
        };
      }
      if (type === "skill") {
        return typeof record.name === "string" ? { type, name: record.name } : null;
      }
      return null;
    })
    .filter((item): item is InputItem => item !== null);
}

export function promptFromInputItems(items: InputItem[]): string {
  return items
    .map((item) => {
      if (item.type === "text") {
        return item.text;
      }
      if (item.type === "skill") {
        return `$${item.name}`;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function parsePrompt(params: Record<string, unknown>): string {
  const inputItems = normalizeInputItems(params.input);
  if (inputItems.length > 0) {
    return promptFromInputItems(inputItems);
  }

  const messages = Array.isArray(params.messages) ? params.messages : [];
  const candidate =
    params.prompt ??
    params.text ??
    params.input ??
    (asRecord(params.userMessage)?.text ?? null) ??
    (asRecord(params.message)?.text ?? null) ??
    messages.find((entry) => asRecord(entry)?.role === "user") ??
    "";

  if (typeof candidate === "string") {
    return candidate;
  }

  const candidateRecord = asRecord(candidate);
  if (typeof candidateRecord?.content === "string") {
    return candidateRecord.content;
  }
  if (typeof candidateRecord?.text === "string") {
    return candidateRecord.text;
  }
  return JSON.stringify(candidate ?? "");
}
