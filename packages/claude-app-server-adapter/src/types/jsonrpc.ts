import type {
  ClientRequest,
  RequestId,
  ServerNotification,
  ServerRequest,
} from "../generated/index.js";

export type JsonRpcId = RequestId;

export type JsonRpcRequest = ClientRequest;

export type AppServerNotification =
  | ServerNotification
  | ServerRequest
  | {
      method: "initialized" | "error";
      params?: unknown;
    };

export type JsonRpcSuccess = {
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcError = {
  id: JsonRpcId;
  error: {
    message: string;
  };
};

export type JsonRpcNotification = AppServerNotification;
