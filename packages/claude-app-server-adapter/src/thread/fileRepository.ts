import fsp from "node:fs/promises";
import path from "node:path";

import type { Thread } from "../generated/v2/index.js";
import type { ThreadRecord, ThreadRepository, TurnRecord } from "./types.js";

export class FileThreadRepository<
  ThreadMeta extends object = Record<string, never>,
  TurnMeta extends object = Record<string, never>,
> implements ThreadRepository<ThreadMeta, TurnMeta> {
  readonly threadsDir: string;

  constructor(rootDir: string) {
    this.threadsDir = path.join(rootDir, "threads");
  }

  async listThreads(): Promise<ThreadRecord<ThreadMeta>[]> {
    await this.ensureThreadsDir();

    const entries = await fsp.readdir(this.threadsDir, { withFileTypes: true });
    const threads = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => this.readThread(entry.name)),
    );

    return threads.filter((thread): thread is ThreadRecord<ThreadMeta> => {
      return thread !== null && !thread.archived;
    });
  }

  async getThread(threadId: string): Promise<ThreadRecord<ThreadMeta>> {
    const thread = await this.readJsonFile<ThreadRecord<ThreadMeta>>(
      this.threadDataPath(threadId),
    );
    if (thread === null) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    return thread;
  }

  async saveThread(thread: ThreadRecord<ThreadMeta>): Promise<void> {
    const threadId = this.extractThreadId(thread.data);
    const threadDir = this.threadDir(threadId);
    await fsp.mkdir(threadDir, { recursive: true });
    await this.writeJsonFile(this.threadDataPath(threadId), thread);
  }

  async getThreadTurns(threadId: string): Promise<TurnRecord<TurnMeta>[]> {
    const turns = await this.readJsonFile<TurnRecord<TurnMeta>[]>(
      this.threadTurnsPath(threadId),
    );
    return turns ?? [];
  }

  async saveThreadTurns(
    threadId: string,
    newTurns: TurnRecord<TurnMeta>[],
  ): Promise<void> {
    const threadDir = this.threadDir(threadId);
    await fsp.mkdir(threadDir, { recursive: true });

    const turns = await this.getThreadTurns(threadId);
    if (turns.length === 0) {
      turns.push(...newTurns);
    } else if (newTurns.length === 1) {
      const newTurn = newTurns[0];
      const index = turns.findIndex(
        (entry) => entry.data.id === newTurn.data.id,
      );
      if (index >= 0) {
        turns[index] = newTurn;
      } else {
        turns.push(newTurn);
      }
    } else {
      const turnIndexMap = new Map(
        turns.map((entry, idx) => [entry.data.id, idx]),
      );
      for (const turn of newTurns) {
        const idx = turnIndexMap.get(turn.data.id);
        if (idx !== undefined) {
          turns[idx] = turn;
        } else {
          turns.push(turn);
          turnIndexMap.set(turn.data.id, turns.length - 1);
        }
      }
    }
    await this.writeJsonFile(this.threadTurnsPath(threadId), turns);
  }

  private async ensureThreadsDir(): Promise<void> {
    await fsp.mkdir(this.threadsDir, { recursive: true });
  }

  private threadDir(threadId: string): string {
    return path.join(this.threadsDir, threadId);
  }

  private threadDataPath(threadId: string): string {
    return path.join(this.threadDir(threadId), "data.json");
  }

  private threadTurnsPath(threadId: string): string {
    return path.join(this.threadDir(threadId), "turns.json");
  }

  private async readThread(
    threadId: string,
  ): Promise<ThreadRecord<ThreadMeta> | null> {
    return this.readJsonFile<ThreadRecord<ThreadMeta>>(
      this.threadDataPath(threadId),
    );
  }

  private async readJsonFile<Value>(filePath: string): Promise<Value | null> {
    try {
      const raw = await fsp.readFile(filePath, "utf8");
      return JSON.parse(raw) as Value;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async writeJsonFile(filePath: string, value: unknown): Promise<void> {
    await fsp.writeFile(
      filePath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }

  private extractThreadId(thread: Omit<Thread, "turns">): string {
    const threadId = typeof thread.id === "string" ? thread.id.trim() : "";
    if (!threadId) {
      throw new Error("Thread record is missing data.id");
    }
    return threadId;
  }

  private isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}
