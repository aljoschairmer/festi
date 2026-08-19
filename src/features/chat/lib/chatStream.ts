import "server-only";

import { type SseSender, sleep } from "@/lib/sse";

/** Probe cadence while a conversation is active. */
const ACTIVE_INTERVAL_MS = 2_000;
const IDLE_INTERVAL_MS = 8_000;
/** How long after the last change the fast cadence is kept. */
const ACTIVE_WINDOW_MS = 60_000;

/**
 * Pushes a snapshot whenever `revision` changes. `revision` runs on every
 * tick and must be cheap; `load` only runs when it moved. Returns when the
 * client disconnects or `load` throws, so a caller that starts refusing
 * access ends the stream.
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
