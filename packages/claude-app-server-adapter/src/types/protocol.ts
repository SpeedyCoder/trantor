import type {
  ClientRequest,
  InitializeParams,
  RequestId,
  ServerNotification,
  ServerRequest,
} from "../generated";
import {
  ThreadArchiveResponse,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeResponse,
  ModelListResponse,
  TurnStartResponse,
} from "../generated/v2";

export type InitializeClientMessage = {
  method: "initialize";
  id: RequestId;
  params: InitializeParams;
};
export type ClientMessage = Exclude<ClientRequest, InitializeClientMessage>;
export type ServerMessage =
  | ServerRequest
  | ServerNotification
  | ThreadReadResponse
  | ThreadResumeResponse
  | ThreadListResponse
  | ThreadArchiveResponse
  | ModelListResponse
  | TurnStartResponse;

export type Server = {
  handleRequest: (request: ClientMessage) => Promise<void>;
  setServerNotificationFilter: (ignoreMessages: string[]) => void;
};

export type Send = (message: ServerMessage) => void;

export type Handlers = Partial<{
  [M in ClientMessage["method"]]: {
    handle: (message: Extract<ClientMessage, { method: M }>) => Promise<void>;
    getThreadId?: (message: Extract<ClientMessage, { method: M }>) => string;
    getTurnId?: (message: Extract<ClientMessage, { method: M }>) => string;
  };
}>;
