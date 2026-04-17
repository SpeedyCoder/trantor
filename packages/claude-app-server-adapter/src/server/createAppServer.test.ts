import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCliArgs } from "../cli/parseCliArgs.js";
import { ThreadRepository } from "../thread/repository.js";
import { createAppServer } from "./createAppServer.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-adapter-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("parseCliArgs", () => {
  it("parses the app-server command", () => {
    expect(
      parseCliArgs([
        "node",
        "index.js",
        "app-server",
        "--workspace-id",
        "ws-1",
        "--data-dir",
        "/tmp/data",
      ]),
    ).toEqual({
      workspaceId: "ws-1",
      dataDir: "/tmp/data",
    });
  });

  it("rejects unsupported commands", () => {
    expect(() => parseCliArgs(["node", "index.js"])).toThrow(/Usage:/);
  });
});

describe("ThreadRepository", () => {
  it("stores each thread in its own file", async () => {
    const root = await makeTempDir();
    const repository = new ThreadRepository(root);
    await repository.init();

    await repository.save({
      id: "thread-1",
      name: "Thread 1",
      cwd: "/workspace",
      modelId: null,
      archived: false,
      createdAt: 1,
      updatedAt: 1,
      sdkSessionId: null,
      messages: [],
    });

    const files = await fs.readdir(path.join(root, "threads"));
    expect(files).toEqual(["thread-1.json"]);
  });
});

describe("createAppServer", () => {
  it("handles thread lifecycle requests against per-thread storage", async () => {
    const root = await makeTempDir();
    const payloads: unknown[] = [];
    const app = await createAppServer({
      workspaceId: "ws-1",
      dataDir: root,
      send: (payload) => payloads.push(payload),
    });

    await app.processLine(JSON.stringify({ id: 1, method: "initialize" }));
    await app.processLine(JSON.stringify({ id: 2, method: "thread/start", params: {} }));

    const threadStart = payloads.find(
      (payload) => typeof payload === "object" && payload !== null && "id" in (payload as object) && (payload as { id?: number }).id === 2,
    ) as { result: { threadId: string } };
    const threadId = threadStart.result.threadId;

    await app.processLine(JSON.stringify({ id: 3, method: "thread/list", params: {} }));
    await app.processLine(
      JSON.stringify({
        id: 4,
        method: "thread/name/set",
        params: { threadId, name: "Renamed" },
      }),
    );
    await app.processLine(JSON.stringify({ id: 5, method: "thread/read", params: { threadId } }));

    const result = payloads.find(
      (payload) => typeof payload === "object" && payload !== null && "id" in (payload as object) && (payload as { id?: number }).id === 5,
    ) as { result: { thread: { name: string } } };

    expect(result.result.thread.name).toBe("Renamed");

    const threadFiles = await fs.readdir(path.join(root, "ws-1", "threads"));
    expect(threadFiles).toEqual([`${threadId}.json`]);
  });

  it("translates Claude streaming output into app-server events", async () => {
    const root = await makeTempDir();
    const payloads: unknown[] = [];
    const query = vi.fn(() => {
      const stream = (async function* () {
        yield {
          type: "system",
          subtype: "init",
          data: { session_id: "session-1" },
        };
        yield {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Hello" },
          },
        };
        yield {
          type: "assistant",
          message: {
            content: [{ text: "Hello world" }],
          },
        };
      })();
      return Object.assign(stream, {
        supportedModels: vi.fn(async () => []),
        interrupt: vi.fn(async () => {}),
      });
    });

    const app = await createAppServer({
      workspaceId: "ws-1",
      dataDir: root,
      send: (payload) => payloads.push(payload),
      sdkLoader: async () => ({ query }),
    });

    await app.processLine(JSON.stringify({ id: 1, method: "thread/start", params: {} }));
    const startPayload = payloads.find(
      (payload) => typeof payload === "object" && payload !== null && "id" in (payload as object) && (payload as { id?: number }).id === 1,
    ) as { result: { threadId: string } };
    await app.processLine(
      JSON.stringify({
        id: 2,
        method: "turn/start",
        params: { threadId: startPayload.result.threadId, input: [{ type: "text", text: "Hi" }] },
      }),
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(
      payloads.some(
        (payload) =>
          typeof payload === "object" &&
          payload !== null &&
          "method" in (payload as object) &&
          (payload as { method?: string }).method === "item/agentMessage/delta",
      ),
    ).toBe(true);

    const repository = new ThreadRepository(path.join(root, "ws-1"));
    const saved = await repository.get(startPayload.result.threadId);
    expect(saved?.sdkSessionId).toBe("session-1");
    expect(saved?.messages.at(-1)).toMatchObject({ type: "agentMessage", text: "Hello world" });
  });

  it("returns model/list from sdk supportedModels", async () => {
    const root = await makeTempDir();
    const payloads: unknown[] = [];
    const supportedModels = vi.fn(async () => [
      {
        value: "claude-sonnet-4-20250514",
        displayName: "Claude Sonnet 4",
        description: "Balanced model",
        supportedEffortLevels: ["low", "high"] as const,
      },
      {
        value: "claude-opus-4-20250514",
        displayName: "Claude Opus 4",
        description: "Highest capability model",
      },
    ]);
    const interrupt = vi.fn(async () => {});

    const app = await createAppServer({
      workspaceId: "ws-1",
      dataDir: root,
      send: (payload) => payloads.push(payload),
      sdkLoader: async () => ({
        query: vi.fn(() => ({
          [Symbol.asyncIterator]: async function* () {},
          supportedModels,
          interrupt,
        })),
      }),
    });

    await app.processLine(JSON.stringify({ id: 1, method: "model/list", params: {} }));

    expect(supportedModels).toHaveBeenCalledTimes(1);
    expect(interrupt).toHaveBeenCalledTimes(1);

    const response = payloads.find(
      (payload) =>
        typeof payload === "object" &&
        payload !== null &&
        "id" in (payload as object) &&
        (payload as { id?: number }).id === 1,
    ) as { result: { data: Array<Record<string, unknown>> } };

    expect(response.result.data).toEqual([
      {
        model: "claude-sonnet-4-20250514",
        displayName: "Claude Sonnet 4",
        description: "Balanced model",
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "" },
          { reasoningEffort: "high", description: "" },
        ],
        defaultReasoningEffort: null,
        isDefault: true,
      },
      {
        model: "claude-opus-4-20250514",
        displayName: "Claude Opus 4",
        description: "Highest capability model",
        supportedReasoningEfforts: [],
        defaultReasoningEffort: null,
        isDefault: false,
      },
    ]);
  });
});
