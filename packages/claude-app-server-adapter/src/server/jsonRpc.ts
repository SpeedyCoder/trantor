import type { JsonRpcRequest } from "../types/jsonrpc.js";

type JsonRpcServerArgs = {
  handleRequest: (request: JsonRpcRequest) => Promise<void>;
};

export function createJsonRpcServer({ handleRequest }: JsonRpcServerArgs) {
  return {
    async processLine(line: string): Promise<void> {
      if (!line.trim()) {
        return;
      }

      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        return;
      }

      if (typeof request.method !== "string" || request.method.trim().length === 0) {
        return;
      }

      await handleRequest(request);
    },
  };
}
