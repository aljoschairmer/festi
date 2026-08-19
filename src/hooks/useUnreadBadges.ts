"use client";

import { useQuery } from "@tanstack/react-query";
import { getUnreadBadges, type UnreadBadges } from "@/lib/unreadBadges";

const EMPTY: UnreadBadges = { notifications: 0, messages: 0 };

/**
 * The unread counts behind the two header badges.
 *
 * Both buttons subscribe to the same query key, so React Query keeps one
 * cache entry and one in-flight request no matter how many components ask.
 * The poll pauses on its own while the tab is hidden: React Query only
 * refetches on an interval when the document is visible unless
 * `refetchIntervalInBackground` is set.
 */
export function useUnreadBadges(): UnreadBadges {
  const { data } = useQuery<UnreadBadges>({
    queryKey: ["unread-badges"],
    queryFn: () => getUnreadBadges(),
    // 15s rather than the former 10s: a badge that lags a few seconds is
    // not worth a third of the idle request volume.
    refetchInterval: 15_000,
  });

  return data ?? EMPTY;
}

export const UNREAD_BADGES_KEY = ["unread-badges"] as const;
