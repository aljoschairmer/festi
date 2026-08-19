"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUnreadDirectCount } from "../actions/direct-chat-action";
import { DirectChatDialog } from "./directChatDialog";

export function DirectChatHeaderButton() {
  const { data: unread = 0 } = useQuery<number>({
    queryKey: ["direct-unread"],
    queryFn: () => getUnreadDirectCount(),
    refetchInterval: 10000,
    // Poll only while the tab is visible — background tabs must not keep
    // firing server-action requests.
    refetchIntervalInBackground: false,
  });

  return (
    <DirectChatDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-2 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-red-500/10 hover:text-foreground"
          aria-label={
            unread > 0 ? `Open messages, ${unread} unread` : "Open messages"
          }
        >
          <MessageCircle className="size-4 text-red-500" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      }
    />
  );
}
