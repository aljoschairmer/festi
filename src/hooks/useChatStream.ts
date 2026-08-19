"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * How often to poll when the stream is not connected. This is the safety net,
 * not the normal path: some corporate proxies and older mobile networks break
 * long-lived responses, and a chat that silently stops updating is worse than
 * one that costs a few requests a minute.
 */
const FALLBACK_INTERVAL_MS = 5_000;

export type ChatStream = {
  /**
   * Feed straight into `useQuery`'s `refetchInterval`. `false` while the
   * stream is delivering — that is the whole point — and a slow poll while it
   * is not.
   */
  refetchInterval: number | false;
};

/**
 * Subscribes to a chat SSE endpoint and writes each snapshot into the query
 * cache under `queryKey`.
 *
 * The component keeps its `useQuery` exactly as it was: the query still owns
 * the first load, the loading state and the fallback, and this only replaces
 * where updates come from afterwards. That also means a browser without
 * `EventSource`, or a network that eats the stream, degrades to polling
 * instead of to a dead thread.
 */
export function useChatStream<T>(
  url: string,
  queryKey: QueryKey,
  { enabled = true }: { enabled?: boolean } = {},
): ChatStream {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  // `queryKey` is an inline array at every call site, so a new identity on
  // every render; serialising it keeps the effect from tearing the connection
  // down and back up on each one.
  const serializedKey = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;

    const key = JSON.parse(serializedKey) as QueryKey;
    const source = new EventSource(url);

    source.addEventListener("snapshot", (event) => {
      try {
        queryClient.setQueryData<T>(key, JSON.parse(event.data));
        setConnected(true);
      } catch {
        // A frame we cannot parse is not a reason to drop the connection;
        // the next snapshot carries the whole thread again.
      }
    });

    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("error", () => {
      // EventSource reconnects on its own. Until a snapshot actually lands
      // the query falls back to polling, so a stream that fails to establish
      // at all never leaves the thread frozen.
      setConnected(false);
    });

    return () => {
      source.close();
      setConnected(false);
    };
  }, [url, serializedKey, enabled, queryClient]);

  return { refetchInterval: connected ? false : FALLBACK_INTERVAL_MS };
}
