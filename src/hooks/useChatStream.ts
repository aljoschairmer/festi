"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/** Safety net for networks that break long-lived responses. */
const FALLBACK_INTERVAL_MS = 5_000;

export type ChatStream = {
  /** For `useQuery`'s `refetchInterval`: `false` while the stream delivers. */
  refetchInterval: number | false;
};

/**
 * Subscribes to a chat SSE endpoint and writes each snapshot into the query
 * cache. The component keeps its `useQuery`, which still owns the first load
 * and the fallback, so a broken stream degrades to polling.
 */
export function useChatStream<T>(
  url: string,
  queryKey: QueryKey,
  { enabled = true }: { enabled?: boolean } = {},
): ChatStream {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  const serializedKey = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;

    const key = JSON.parse(serializedKey) as QueryKey;
    const source = new EventSource(url);

    source.addEventListener("snapshot", (event) => {
      try {
        queryClient.setQueryData<T>(key, JSON.parse(event.data));
        setConnected(true);
      } catch {}
    });

    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("error", () => {
      setConnected(false);
    });

    return () => {
      source.close();
      setConnected(false);
    };
  }, [url, serializedKey, enabled, queryClient]);

  return { refetchInterval: connected ? false : FALLBACK_INTERVAL_MS };
}
