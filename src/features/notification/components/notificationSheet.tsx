"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellDot,
  Bike,
  Check,
  Heart,
  Megaphone,
  MessageCircle,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UNREAD_BADGES_KEY, useUnreadBadges } from "@/hooks/useUnreadBadges";
import {
  getNotifications,
  markNotificationsSeen,
  type NotificationItem,
} from "../actions/notification-actions";
import { NotificationType } from "../types";

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.round(diffMs / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

export function notificationText(notification: NotificationItem) {
  const name = notification.actor?.name ?? "Someone";
  switch (notification.type) {
    case NotificationType.USER_FOLLOWED:
      return `${name} started following you.`;
    case NotificationType.GROUP_JOINED:
      return notification.message
        ? `${name} joined your group "${notification.message}".`
        : `${name} joined your group.`;
    case NotificationType.GROUP_JOIN_REQUESTED:
      return notification.message ?? `${name} requested to join your group.`;
    case NotificationType.GROUP_JOIN_APPROVED:
      return (
        notification.message ?? `Your request to join the group was approved.`
      );
    case NotificationType.GROUP_JOIN_REJECTED:
      return (
        notification.message ?? `Your request to join the group was declined.`
      );
    case NotificationType.RIDE_UPDATED:
      return notification.message
        ? `The ride "${notification.message}" was updated — check the new details.`
        : `A ride you joined was updated.`;
    case NotificationType.RIDE_CANCELLED:
      return notification.message
        ? `The ride "${notification.message}" was cancelled.`
        : `A ride you joined was cancelled.`;
    case NotificationType.RIDE_WAITLIST_PROMOTED:
      return notification.message
        ? `A spot freed up — you're now pending approval for "${notification.message}".`
        : `A spot freed up on a ride you waitlisted for.`;
    case NotificationType.GROUP_RIDE_CREATED:
      return notification.message
        ? `${name} posted the ride "${notification.message}" to your group.`
        : `${name} posted a ride to your group.`;
    case NotificationType.GROUP_ANNOUNCEMENT:
      return notification.message
        ? `${name} posted an announcement in "${notification.message}".`
        : `${name} posted an announcement in your group.`;
    case NotificationType.POST_LIKED:
      return notification.message
        ? `${name} liked your post "${notification.message}".`
        : `${name} liked your post.`;
    case NotificationType.POST_COMMENTED:
      return notification.message
        ? `${name} commented on your post "${notification.message}".`
        : `${name} commented on your post.`;
    case NotificationType.RIDE_JOIN_REQUEST:
      return notification.message
        ? `${name} asked to join your ride "${notification.message}".`
        : `${name} asked to join your ride.`;
    case NotificationType.RIDE_JOIN_APPROVED:
      return notification.message
        ? `${name} approved your request to join "${notification.message}".`
        : `Your request to join the ride was approved.`;
    case NotificationType.RIDE_JOIN_REJECTED:
      return notification.message
        ? `${name} declined your request to join "${notification.message}".`
        : `Your request to join the ride was declined.`;
    default:
      return notification.message ?? "You have a new notification.";
  }
}

export function NotificationIcon({ type }: { type: NotificationItem["type"] }) {
  if (
    type === NotificationType.GROUP_JOINED ||
    type === NotificationType.GROUP_JOIN_REQUESTED
  ) {
    return <Users className="size-4 text-primary" />;
  }
  if (
    type === NotificationType.GROUP_JOIN_APPROVED ||
    type === NotificationType.RIDE_JOIN_APPROVED
  ) {
    return <Check className="size-4 text-green-500" />;
  }
  if (
    type === NotificationType.GROUP_JOIN_REJECTED ||
    type === NotificationType.RIDE_JOIN_REJECTED ||
    type === NotificationType.RIDE_CANCELLED
  ) {
    return <X className="size-4 text-primary" />;
  }
  if (
    type === NotificationType.RIDE_JOIN_REQUEST ||
    type === NotificationType.RIDE_UPDATED ||
    type === NotificationType.RIDE_WAITLIST_PROMOTED ||
    type === NotificationType.GROUP_RIDE_CREATED
  ) {
    return <Bike className="size-4 text-primary" />;
  }
  if (type === NotificationType.POST_LIKED) {
    return <Heart className="size-4 text-primary" />;
  }
  if (type === NotificationType.POST_COMMENTED) {
    return <MessageCircle className="size-4 text-primary" />;
  }
  if (type === NotificationType.GROUP_ANNOUNCEMENT) {
    return <Megaphone className="size-4 text-primary" />;
  }
  return <UserPlus className="size-4 text-primary" />;
}

export function notificationHref(
  notification: NotificationItem,
): string | null {
  const { targetType, targetId } = notification;
  if (targetType === "Ride" && targetId) {
    return `/dashboard/community-rides/${targetId}`;
  }
  if (targetType === "Group" && targetId) {
    return `/dashboard/community/g/${targetId}`;
  }

  if (
    notification.type === NotificationType.USER_FOLLOWED &&
    notification.actor
  ) {
    return `/dashboard/community/u/${notification.actor.id}`;
  }

  return null;
}

export function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: NotificationItem;
  onNavigate: () => void;
}) {
  const actor = notification.actor;
  const href = notificationHref(notification);

  const body = (
    <>
      <div className="relative shrink-0">
        <Avatar className="size-9">
          <AvatarImage src={actor?.image ?? undefined} alt={actor?.name} />
          <AvatarFallback>
            {actor?.name?.slice(0, 2).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-background bg-background">
          <NotificationIcon type={notification.type} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm">{notificationText(notification)}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>

      {notification.read ? null : (
        <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </>
  );

  const className = `flex items-start gap-3 rounded-lg p-3 transition ${
    notification.read ? "" : "bg-primary/5"
  }`;

  if (!href) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`${className} hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {body}
    </Link>
  );
}

const NotificationSheet = () => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { notifications: unread } = useUnreadBadges();

  const {
    data: notifications,
    isLoading,
    isError,
    refetch,
  } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    enabled: open,
    refetchInterval: open ? 10000 : false,
    refetchIntervalInBackground: false,
  });

  const markSeen = useMutation({
    mutationFn: () => markNotificationsSeen(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UNREAD_BADGES_KEY });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per open
  useEffect(() => {
    if (open && unread > 0) {
      markSeen.mutate();
    }
  }, [open]);

  const items = notifications ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-2 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-primary/10 hover:text-foreground"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <BellDot className="size-4 text-primary" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Follows and group activity land here.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Something went wrong loading your notifications.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BellDot className="mb-4 size-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No notifications yet</p>
              <p className="text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            </div>
          ) : (
            items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onNavigate={() => setOpen(false)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationSheet;
