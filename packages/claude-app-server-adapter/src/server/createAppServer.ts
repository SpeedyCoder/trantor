import path from "node:path";
import type { ClientMessage, ServerMessage } from "../types/protocol";
import { createJsonRpcServer } from "./jsonRpc.js";
import { ErrorNotification } from "../generated/v2/ErrorNotification.js";
import { newHandlers } from "./handlers.js";
import { FileThreadRepository } from "../thread/fileRepository";
import { ClaudeThreadMetadata, ClaudeTurnMetadata } from "../claude/types";
import type { Handlers } from "../types/protocol";

type AppServerArgs = {
  workspaceId: string;
  dataDir: string;
  workspacePath?: string;
  send: (payload: ServerMessage) => void;
};

type AppServerHandler = {
  handle: (message: ClientMessage) => Promise<void>;
  getThreadId?: (message: ClientMessage) => string;
  getTurnId?: (message: ClientMessage) => string;
};

function getHandler(
  handlers: Handlers,
  request: ClientMessage,
): AppServerHandler | undefined {
  return handlers[request.method] as AppServerHandler | undefined;
}

export async function createAppServer({
  workspaceId,
  dataDir,
  workspacePath = process.env.CODEXMONITOR_WORKSPACE_PATH || process.cwd(),
  send,
}: AppServerArgs) {
  let skipSendMessages = new Set<string>();
  const filteredSend = (payload: ServerMessage) => {
    const method = "method" in payload ? payload.method : "";
    if (skipSendMessages.has(method)) {
      return;
    }
    send(payload);
  };
  const stateDir = path.join(dataDir, workspaceId);
  const repository = new FileThreadRepository<
    ClaudeThreadMetadata,
    ClaudeTurnMetadata
  >(stateDir);
  const handlers = newHandlers(workspacePath, repository, filteredSend);

  const server = createJsonRpcServer({
    async handleRequest(request: ClientMessage) {
      const handler = getHandler(handlers, request);
      if (!handler) {
        const params: ErrorNotification = newErrorParams(
          `Unsupported methods: ${request.method}`,
        );
        send({ method: "error", params });
        return;
      }
      try {
        await handler.handle(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        send({
          method: "error",
          params: newErrorParams(
            message,
            handler?.getThreadId?.(request),
            handler?.getTurnId?.(request),
          ),
        });
      }
    },
    setServerNotificationFilter: (ignoreMessages: string[]) => {
      skipSendMessages = new Set(ignoreMessages);
    },
  });

  return {
    repository,
    processLine: server.processLine,
  };
}

function newErrorParams(
  message: string,
  threadId?: string,
  turnId?: string,
): ErrorNotification {
  return {
    error: {
      message,
      codexErrorInfo: null,
      additionalDetails: null,
    },
    willRetry: false,
    threadId: threadId ?? "",
    turnId: turnId ?? "",
  };
}
