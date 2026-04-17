import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppServer } from "./app.mjs";
import { parseCliArgs } from "./cli.mjs";
import { ThreadRepository } from "./storage.mjs";

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
        "index.mjs",
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
    expect(() => parseCliArgs(["node", "index.mjs"])).toThrow(/Usage:/);
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
    const query = vi.fn(async function* () {
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
});
