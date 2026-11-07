// Runs one task per item, a few at a time, and gives each task its own
// deadline. A task that hangs is aborted at its deadline and frees its place
// for the next item, so one stalled project never holds the others back.

import { setTimeout as delay } from "node:timers/promises";

/** How one item ended. `timeout` means the deadline passed first. */
export type Settled<R> =
  | { readonly kind: "done"; readonly value: R }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "timeout" };

export interface FanOutOptions {
  /** How many tasks run at once. */
  readonly limit: number;
  /** How long one task may take, counted from when it starts, not from when it queues. */
  readonly deadlineMs: number;
}

// A task that ignores its signal still can't outlive the deadline: the race
// ends the wait, and the abort cancels whatever the task started.
const runOne = async <T, R>(
  item: T,
  task: (item: T, signal: AbortSignal) => Promise<R>,
  deadlineMs: number
): Promise<Settled<R>> => {
  const controller = new AbortController();
  // Ends the timer when the task finishes first.
  const done = new AbortController();
  const expire = async (): Promise<Settled<R>> => {
    await delay(deadlineMs, undefined, { signal: done.signal });
    controller.abort();
    return { kind: "timeout" };
  };
  const attempt = async (): Promise<Settled<R>> => {
    try {
      return { kind: "done", value: await task(item, controller.signal) };
    } catch (error) {
      return { error, kind: "failed" };
    }
  };
  try {
    return await Promise.race([attempt(), expire()]);
  } finally {
    done.abort();
  }
};

/**
 * The result of each item, in the order of `items`, whatever order the tasks
 * finish in. Never rejects: a task's failure or timeout is its result.
 */
export const fanOut = async <T, R>(
  items: readonly T[],
  task: (item: T, signal: AbortSignal) => Promise<R>,
  options: FanOutOptions
): Promise<Settled<R>[]> => {
  const results: Settled<R>[] = [];
  // Every worker takes the next item from the same iterator.
  const queue = items.entries();
  const worker = async (): Promise<void> => {
    const next = queue.next();
    if (next.done) {
      return;
    }
    const [at, item] = next.value;
    results[at] = await runOne(item, task, options.deadlineMs);
    await worker();
  };
  const workers = Math.max(1, Math.min(options.limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
};
