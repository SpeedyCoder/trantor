import type {
  AppServerNotification,
  JsonRpcError,
  JsonRpcId,
  JsonRpcSuccess,
} from "../types/jsonrpc.js";

export function sendResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { id, result };
}

export function sendError(id: JsonRpcId, message: string): JsonRpcError {
  return { id, error: { message } };
}

export function notify(
  method: AppServerNotification["method"],
  params: unknown = {},
): AppServerNotification {
  return { method, params } as AppServerNotification;
}
