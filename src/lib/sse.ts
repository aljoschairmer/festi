/**
 * Server-sent-events plumbing: the parts every stream needs and none of the
 * parts that differ between them.
 *
 * Extracted from `api/pro/live/[race]/[year]/[stage]/route.ts`, which grew
 * this logic first. That route is left on its own copy — it interleaves two
 * upstream lanes and is working in production; this helper exists for the
 * chat streams and is written so that route could adopt it later.
 */

/** Comment frames keep intermediaries from reaping an idle connection. */
const HEARTBEAT_MS = 20_000;

/** The retry hint handed to `EventSource`. */
const RECONNECT_DELAY_MS = 3_000;

/** Abort-aware sleep: resolves early (never rejects) when the signal fires. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

export type SseSender = {
  /** Emits one named event carrying `data` as JSON. */
  send: (event: string, data: unknown) => void;
  /** Fires on client disconnect, on a dead enqueue, or when `run` returns. */
  signal: AbortSignal;
};

/**
 * Wraps `run` in an event-stream response.
 *
 * `run` owns the lifetime of the stream: the connection stays open until it
 * returns or the client goes away, whichever happens first. It must check
 * `signal.aborted` around anything long-lived — writing after the client
 * leaves is silently dropped, but a loop that ignores the signal never ends.
 */
export function sseResponse(
  request: Request,
  run: (sender: SseSender) => Promise<void>,
): Response {
  // One controller tied to everything long-lived in the handler: client
  // disconnect (request.signal / cancel), a dead enqueue, or `run` finishing
  // all funnel through it so nothing leaks.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (frame: string) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // Enqueue on a closed stream — the client is gone.
          abort.abort();
        }
      };

      const heartbeat = setInterval(
        () => write(": heartbeat\n\n"),
        HEARTBEAT_MS,
      );
      abort.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed or errored.
        }
      });

      write(`retry: ${RECONNECT_DELAY_MS}\n\n`);

      void run({
        send: (event, data) =>
          write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        signal: abort.signal,
      })
        .catch(() => {
          // Closing makes EventSource retry with a fresh handler.
        })
        .finally(() => abort.abort());
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // `no-transform` keeps proxies from buffering or compressing the
      // stream, which would hold events back from the client.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
