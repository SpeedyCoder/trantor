import type {
  ClientRequest,
  InitializeParams,
  InitializeResponse,
  RequestId,
  ServerNotification,
  ServerRequest,
} from "../generated";
import {
  ThreadArchiveResponse,
  ThreadCompactStartResponse,
  ThreadForkResponse,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadSetNameResponse,
  ThreadStartResponse,
  CollaborationModeListResponse,
  ModelListResponse,
  TurnInterruptResponse,
  TurnStartResponse,
  TurnSteerResponse,
} from "../generated/v2";

export type InitializeClientMessage = {
  method: "initialize";
  id: RequestId;
  params: InitializeParams;
};
export type ClientMessage = Exclude<ClientRequest, InitializeClientMessage>;
export type ResponsePayload =
  | InitializeResponse
  | ThreadStartResponse
  | ThreadReadResponse
  | ThreadResumeResponse
  | ThreadForkResponse
  | ThreadListResponse
  | ThreadArchiveResponse
  | ThreadCompactStartResponse
  | ThreadSetNameResponse
  | CollaborationModeListResponse
  | ModelListResponse
  | TurnStartResponse
  | TurnSteerResponse
  | TurnInterruptResponse;

export type ServerResponse =
  | {
      id: RequestId;
      result: ResponsePayload;
    }
  | {
      id: RequestId;
      error: {
        message: string;
      };
    };

export type ServerMessage = ServerRequest | ServerNotification | ServerResponse;

export type Server = {
  send: Send;
  handleRequest: (request: ClientMessage) => Promise<void>;
  setServerNotificationFilter: (ignoreMessages: string[]) => void;
};

export type Send = (message: ServerMessage) => void;

export type Handlers = Partial<{
  [M in ClientMessage["method"]]: {
    handle: (
      message: Extract<ClientMessage, { method: M }>,
    ) => Promise<ResponsePayload>;
  };
}>;
