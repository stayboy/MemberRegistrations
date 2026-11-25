/**
 * The queue port.
 *
 * This is the whole surface the domain is allowed to see: a job is a kind, an
 * opaque payload and an id. Nothing here knows what a notification, a channel
 * or a provider is, and no adapter shape (pg-boss, a hosted tick, an in-memory
 * double) leaks through it. Swapping the implementation must not touch a
 * caller (notification spec N-8, FR-20).
 */
export interface EnqueueOptions {
  /**
   * The unit this job is for, e.g. `instance:<id>` or `delivery:<id>`. Every
   * job is a unit: a queue holds at most one live job per key, so a second
   * enqueue, or a retry, cannot duplicate that unit's work. A job with no key
   * is the queue's single unnamed unit.
   */
  singletonKey?: string;
  /** The absolute instant the job may first run; omitted means now. */
  startAfter?: Date;
}

export interface QueueJob<T = unknown> {
  id: string;
  kind: string;
  payload: T;
}

/** A handler resolves when the unit of work is done; a throw means it failed. */
export type JobHandler<T = unknown> = (job: QueueJob<T>) => Promise<void>;

export interface Queue {
  /** Returns the job id, or `null` when the singleton key already holds one. */
  enqueue(kind: string, payload: unknown, options?: EnqueueOptions): Promise<string | null>;
  /** Registers a handler. All handlers are registered before `start()`. */
  work<T = unknown>(kind: string, handler: JobHandler<T>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
