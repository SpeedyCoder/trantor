import { randomUUID } from "node:crypto";
import { ThreadRecord } from "./types.js";

export function now(): number {
  return Date.now();
}

export function createThread<ThreadMeta extends object>(
  cwd: string,
  metadata: ThreadMeta,
  name = "New AI Agent Thread",
): ThreadRecord<ThreadMeta> {
  const timestamp = now();
  return {
    data: {
      id: randomUUID(),
      name,
      cwd,
      createdAt: timestamp,
      updatedAt: timestamp,
      preview: "",
      ephemeral: false,
      modelProvider: "",
      status: { type: "notLoaded" },
      path: null,
      cliVersion: "",
      source: "appServer",
      agentNickname: null,
      agentRole: null,
      gitInfo: null,
    },
    archived: false,
    metadata,
  };
}

export function forkThread<ThreadMeta extends object>(
  source: ThreadRecord<ThreadMeta>,
  forkMeta: (meta: ThreadMeta) => ThreadMeta,
): ThreadRecord<ThreadMeta> {
  const timestamp = now();
  return {
    data: {
      ...source.data,
      id: randomUUID(),
      name: `${source.data.name} (fork)`,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    archived: false,
    metadata: forkMeta(source.metadata),
  };
}
