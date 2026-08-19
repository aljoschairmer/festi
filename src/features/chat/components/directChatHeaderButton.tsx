"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnreadBadges } from "@/hooks/useUnreadBadges";
import { DirectChatDialog } from "./directChatDialog";

export function DirectChatHeaderButton() {
  const { messages: unread } = useUnreadBadges();

  return (
    <DirectChatDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-2 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-primary/10 hover:text-foreground"
          aria-label={
            unread > 0 ? `Open messages, ${unread} unread` : "Open messages"
          }
        >
          <MessageCircle className="size-4 text-primary" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      }
    />
  );
}
