import "server-only";

import { type SseSender, sleep } from "@/lib/sse";

/**
 * Cadence of the server-side change probe.
 *
 * Chat has no upstream to subscribe to — the only source of truth is the
 * database, written by some other user's request on some other instance. So
 * this is not a push architecture pretending to be one: the polling still
 * happens, it just happens once on the server instead of once per open tab,
 * and it asks a much cheaper question.
 *
 * What that actually buys, per open thread:
 *
 *   before: 30 requests/minute, each one a session lookup, a membership
 *           check, a 100-row message fetch and a full JSON payload on the
 *           wire — whether or not anything had changed.
 *   after:  one connection. Auth and membership are checked once at connect,
 *           then an indexed `count + max(createdAt)` probe decides whether
 *           there is anything to send. Nothing changed means nothing is
 *           fetched and nothing is sent.
 *
 * The probe slows down once a conversation goes quiet. Two seconds matters
 * while people are typing at each other; after a minute of silence nobody
 * notices the difference, and an idle thread drops from 30 probes a minute
 * to about 7.
 */
const ACTIVE_INTERVAL_MS = 2_000;
const IDLE_INTERVAL_MS = 8_000;
/** How long after the last change the fast cadence is kept. */
const ACTIVE_WINDOW_MS = 60_000;

/**
 * Pushes a fresh snapshot whenever `revision` reports that something changed.
 *
 * `revision` must be cheap — it runs on every tick. `load` is the expensive
 * one and only runs when the revision moved. The first tick always sends, so
 * a reconnecting client re-syncs immediately without needing patch replay.
 *
 * Returns when the client disconnects, or when `load` throws — which is how
 * losing access mid-stream is handled: `getGroupMessages` refuses a
 * non-member, the stream ends, and the client is left with what it had.
 */
export async function streamOnChange<T>({
  sender,
  revision,
  load,
}: {
  sender: SseSender;
  revision: () => Promise<string>;
  load: () => Promise<T>;
}): Promise<void> {
  const { send, signal } = sender;
  let lastRevision: string | null = null;
  let lastChangeAt = Date.now();

  while (!signal.aborted) {
    const current = await revision();

    if (current !== lastRevision) {
      const snapshot = await load();
      if (signal.aborted) return;
      send("snapshot", snapshot);
      lastRevision = current;
      lastChangeAt = Date.now();
    }

    const quietFor = Date.now() - lastChangeAt;
    await sleep(
      quietFor < ACTIVE_WINDOW_MS ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS,
      signal,
    );
  }
}
