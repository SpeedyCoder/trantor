import { ThreadRepository } from "../thread/types";

export type ClaudeThreadMetadata = {
  sessionId: string;
  model: string | null;
};

export type ClaudeTurnMetadata = object;

export type ClaudeRepository = ThreadRepository<
  ClaudeThreadMetadata,
  ClaudeTurnMetadata
>;
