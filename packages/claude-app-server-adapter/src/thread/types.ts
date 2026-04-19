import { Turn } from "../generated/v2";
import { Thread } from "../generated/v2/Thread";

export type ThreadRecord<Metadata extends object> = {
  data: Omit<Thread, "turns">;
  archived: boolean;
  metadata: Metadata;
};

export type TurnRecord<Metadata extends object> = {
  data: Turn;
  metadata: Metadata;
};

export interface ThreadRepository<
  ThreadMeta extends object,
  TurnMeta extends object,
> {
  listThreads: () => Promise<ThreadRecord<ThreadMeta>[]>;
  getThread: (threadId: string) => Promise<ThreadRecord<ThreadMeta>>;
  saveThread: (thread: ThreadRecord<ThreadMeta>) => Promise<void>;

  getThreadTurns: (threadId: string) => Promise<TurnRecord<TurnMeta>[]>;
  saveThreadTurns: (
    threadId: string,
    turn: TurnRecord<TurnMeta>[],
  ) => Promise<void>;
}
