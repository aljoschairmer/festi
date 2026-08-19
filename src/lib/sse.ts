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
 * Wraps `run` in an event-stream response. `run` owns the stream's lifetime
 * and must check `signal.aborted` around anything long-lived: writes after
 * the client leaves are dropped, but a loop ignoring the signal never ends.
 */
export function sseResponse(
  request: Request,
  run: (sender: SseSender) => Promise<void>,
): Response {
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
        } catch {}
      });

      write(`retry: ${RECONNECT_DELAY_MS}\n\n`);

      void run({
        send: (event, data) =>
          write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        signal: abort.signal,
      })
        .catch(() => {})
        .finally(() => abort.abort());
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",

      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
