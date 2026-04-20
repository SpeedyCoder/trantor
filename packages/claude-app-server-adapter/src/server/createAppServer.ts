import path from "node:path";
import type {
  ClientMessage,
  ResponsePayload,
  ServerMessage,
} from "../types/protocol.js";
import { createJsonRpcServer } from "./jsonRpc.js";
import { ErrorNotification } from "../generated/v2/ErrorNotification.js";
import { newHandlers } from "../claude/handlers.js";
import { FileThreadRepository } from "../thread/fileRepository.js";
import { ClaudeThreadMetadata, ClaudeTurnMetadata } from "../claude/types.js";
import type { Handlers } from "../types/protocol.js";

type AppServerArgs = {
  workspaceId: string;
  dataDir: string;
  workspacePath?: string;
  send: (payload: ServerMessage) => void;
};

type AppServerHandler = {
  handle: (message: ClientMessage) => Promise<ResponsePayload>;
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
    send,
    async handleRequest(request: ClientMessage) {
      const handler = getHandler(handlers, request);
      if (!handler) {
        send({
          id: request.id,
          error: { message: `Unsupported method: ${request.method}` },
        });
        return;
      }
      try {
        const result = await handler.handle(request);
        send({ id: request.id, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        send({ id: request.id, error: { message } });
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
