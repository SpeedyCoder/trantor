import fs from "node:fs/promises";
import path from "node:path";

import type { ThreadRecord } from "./types.mjs";

function isThreadRecord(value: unknown): value is ThreadRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.cwd === "string" &&
    typeof record.archived === "boolean" &&
    typeof record.createdAt === "number" &&
    typeof record.updatedAt === "number" &&
    Array.isArray(record.messages)
  );
}

export class ThreadRepository {
  readonly rootDir: string;
  readonly threadsDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.threadsDir = path.join(rootDir, "threads");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.threadsDir, { recursive: true });
  }

  filePath(threadId: string): string {
    return path.join(this.threadsDir, `${threadId}.json`);
  }

  async list(): Promise<ThreadRecord[]> {
    const entries = await fs.readdir(this.threadsDir, { withFileTypes: true }).catch(() => []);
    const threads = await Promise.all(
      entries
        .filter((entry: any) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry: any) => this.get(path.basename(entry.name, ".json"))),
    );
    return threads
      .filter((thread): thread is ThreadRecord => thread !== null)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  async get(threadId: string): Promise<ThreadRecord | null> {
    const file = this.filePath(threadId);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return isThreadRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(thread: ThreadRecord): Promise<void> {
    const file = this.filePath(thread.id);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(thread, null, 2);
    await fs.mkdir(this.threadsDir, { recursive: true });
    await fs.writeFile(temp, payload);
    await fs.rename(temp, file);
  }
}
