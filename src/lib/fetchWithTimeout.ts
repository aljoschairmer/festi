import "server-only";

/** Default budget for a single outbound call from a server action. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * `fetch` with a deadline, so a wedged upstream cannot pin a server action
 * open. An existing `signal` on `init` still applies; whichever fires first
 * wins.
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(`Upstream request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
