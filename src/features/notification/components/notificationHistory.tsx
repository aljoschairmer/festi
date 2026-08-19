"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { BellDot, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getNotificationHistory,
  type NotificationCursor,
  type NotificationHistoryPage,
} from "../actions/notification-actions";
import { NotificationRow } from "./notificationSheet";

/**
 * Full notification history with cursor pagination, reusing the notification
 * row rendering (including target links) from the header sheet.
 */
export function NotificationHistory() {
  const query = useInfiniteQuery<NotificationHistoryPage>({
    queryKey: ["notification-history"],
    queryFn: ({ pageParam }) =>
      getNotificationHistory(pageParam as NotificationCursor),
    initialPageParam: undefined as NotificationCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {["a", "b", "c", "d"].map((key) => (
          <div key={key} className="flex items-center gap-3 p-2">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Something went wrong loading your notifications.
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const items = (query.data?.pages ?? []).flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BellDot className="mb-4 size-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">No notifications yet</p>
        <p className="text-sm text-muted-foreground">
          Follows, group activity, and ride updates land here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          onNavigate={() => {}}
        />
      ))}

      {query.hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
