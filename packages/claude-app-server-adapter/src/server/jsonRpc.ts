import { ClientNotification, InitializeResponse } from "../generated";
import {
  ClientMessage,
  InitializeClientMessage,
  Server,
} from "../types/protocol";

export function createJsonRpcServer({
  send,
  handleRequest,
  setServerNotificationFilter,
}: Server) {
  let initialized = false;
  return {
    async processLine(line: string): Promise<void> {
      if (!line.trim()) {
        return;
      }

      let request: ClientMessage | ClientNotification | InitializeClientMessage;
      try {
        request = JSON.parse(line);
      } catch {
        return;
      }
      if (request.method === "initialize") {
        const optOut = request.params.capabilities?.optOutNotificationMethods;
        if (optOut) {
          setServerNotificationFilter(optOut);
        }
        const result: InitializeResponse = {
          userAgent: "Claude",
          platformFamily: "unix",
          platformOs: "macos",
        };
        send({ id: request.id, result });
        return;
      }
      if (request.method === "initialized") {
        initialized = true;
        return;
      }
      if (!initialized) {
        console.warn("Ignoring message before initialization:", request.method);
        return;
      }

      await handleRequest(request);
    },
  };
}
