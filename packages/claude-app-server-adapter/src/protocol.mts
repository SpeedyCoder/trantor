import type {
  JsonRpcError,
  JsonRpcId,
  JsonRpcNotification,
  JsonRpcSuccess,
} from "./types.mjs";

export function sendResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { id, result };
}

export function sendError(id: JsonRpcId, message: string): JsonRpcError {
  return { id, error: { message } };
}

export function notify(method: string, params: unknown = {}): JsonRpcNotification {
  return { method, params };
}
