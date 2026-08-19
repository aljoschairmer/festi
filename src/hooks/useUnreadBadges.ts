"use client";

import { useQuery } from "@tanstack/react-query";
import { getUnreadBadges, type UnreadBadges } from "@/lib/unreadBadges";

const EMPTY: UnreadBadges = { notifications: 0, messages: 0 };

/**
 * Both buttons share one query key, so any number of callers cost one
 * request. React Query pauses the interval while the tab is hidden.
 */
export function useUnreadBadges(): UnreadBadges {
  const { data } = useQuery<UnreadBadges>({
    queryKey: ["unread-badges"],
    queryFn: () => getUnreadBadges(),

    refetchInterval: 15_000,
  });

  return data ?? EMPTY;
}

export const UNREAD_BADGES_KEY = ["unread-badges"] as const;
