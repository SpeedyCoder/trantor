export type AdapterInputItem =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "localImage"; path: string }
  | { type: "mention"; name?: string; path?: string }
  | { type: "skill"; name: string };

export type UserMessageItem = {
  id: string;
  type: "userMessage";
  turnId: string;
  content: AdapterInputItem[];
};

export type AgentMessageItem = {
  id: string;
  type: "agentMessage";
  turnId: string;
  text: string;
};

export type ThreadMessage = UserMessageItem | AgentMessageItem;

export type ThreadTurn = {
  id: string;
  status: string;
  items: ThreadMessage[];
};

export type ThreadRecord = {
  id: string;
  name: string;
  cwd: string;
  modelId: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  sdkSessionId: string | null;
  messages: ThreadMessage[];
};

export type ThreadSummary = {
  id: string;
  name: string;
  cwd: string;
  modelId: string | null;
  model: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  source: {
    kind: "appServer";
  };
};

export type ThreadRecordResponse = ThreadSummary & {
  preview: string;
  turns: ThreadTurn[];
};

export type ClaudeSdkMessage = Record<string, unknown>;

export type ClaudeModelInfo = {
  value: string;
  displayName: string;
  description: string;
  supportedEffortLevels?: ReadonlyArray<
    "low" | "medium" | "high" | "xhigh" | "max"
  >;
};

export type ClaudeQueryHandle = AsyncIterable<ClaudeSdkMessage> & {
  supportedModels(): Promise<ClaudeModelInfo[]>;
  interrupt(): Promise<void>;
};

export type ClaudeSdkModule = {
  query(args: {
    prompt: string;
    options: Record<string, unknown>;
  }): ClaudeQueryHandle;
};
