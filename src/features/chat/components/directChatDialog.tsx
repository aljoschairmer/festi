"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type FollowConnections,
  type FollowUser,
  getFollowConnections,
} from "@/features/followers/actions/getFollowConnections";
import {
  type DirectConversation,
  getDirectConversations,
} from "../actions/direct-chat-action";
import { DirectChatThread } from "./directChatThread";

export type ChatPartner = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
};

function ConversationList({
  conversations,
  isLoading,
  activePartnerId,
  onSelect,
}: {
  conversations: DirectConversation[];
  isLoading: boolean;
  activePartnerId: string | null;
  onSelect: (partner: ChatPartner) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <div key={i} className="flex items-center gap-2 p-2">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        No conversations yet. Start a new message.
      </p>
    );
  }

  return (
    <div className="space-y-0.5 p-1">
      {conversations.map(({ partner, lastMessage, unreadCount }) => (
        <button
          key={partner.id}
          type="button"
          onClick={() => onSelect(partner)}
          className={`flex w-full items-center gap-2 rounded-lg p-2 text-left transition hover:bg-muted/50 ${
            activePartnerId === partner.id ? "bg-muted" : ""
          }`}
        >
          <div className="relative shrink-0">
            <Avatar className="size-9">
              <AvatarImage
                src={partner.image ?? undefined}
                alt={partner.name}
              />
              <AvatarFallback>
                {partner.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {partner.isOnline ? (
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-green-500" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{partner.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {lastMessage
                ? `${lastMessage.fromMe ? "You: " : ""}${lastMessage.content}`
                : `@${partner.username ?? "rider"}`}
            </p>
          </div>
          {unreadCount > 0 ? (
            <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-white">
              {unreadCount}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function NewChatPicker({
  onSelect,
}: {
  onSelect: (partner: ChatPartner) => void;
}) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<FollowConnections>({
    queryKey: ["follow-connections"],
    queryFn: () => getFollowConnections(),
  });

  const mutual = useMemo<FollowUser[]>(() => {
    const all = data?.mutual ?? [];
    const query = search.toLowerCase().trim();
    if (!query) return all;
    return all.filter((user) =>
      [user.name, user.username].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [data, search]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search mutual followers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        ) : mutual.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {search ? "No matches found." : "No mutual followers yet."}
          </p>
        ) : (
          mutual.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => onSelect(user)}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition hover:bg-muted/50"
            >
              <Avatar className="size-9 shrink-0">
                <AvatarImage src={user.image ?? undefined} alt={user.name} />
                <AvatarFallback>
                  {user.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{user.username ?? "rider"}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function DirectChatDialog({
  trigger,
  initialPartner,
}: {
  trigger: React.ReactNode;
  initialPartner?: ChatPartner;
}) {
  const [open, setOpen] = useState(false);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  useEffect(() => {
    if (open) {
      setActivePartnerId(initialPartner?.id ?? null);
      setShowNewChat(false);
    }
  }, [open, initialPartner?.id]);

  const { data: conversations, isLoading } = useQuery<DirectConversation[]>({
    queryKey: ["direct-conversations"],
    queryFn: () => getDirectConversations(),
    refetchInterval: 5000,
    enabled: open,
  });

  const handleSelect = (partner: ChatPartner) => {
    setActivePartnerId(partner.id);
    setShowNewChat(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex h-[70vh] max-h-[600px] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Messages</DialogTitle>

        <aside className="flex w-64 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between border-b p-3">
            {showNewChat ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setShowNewChat(false)}
              >
                <ArrowLeftIcon className="size-4" />
                Back
              </Button>
            ) : (
              <>
                <h2 className="text-sm font-semibold">Messages</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New message"
                  onClick={() => setShowNewChat(true)}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </>
            )}
          </div>

          {showNewChat ? (
            <NewChatPicker onSelect={handleSelect} />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ConversationList
                conversations={conversations ?? []}
                isLoading={isLoading}
                activePartnerId={activePartnerId}
                onSelect={handleSelect}
              />
            </div>
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {activePartnerId ? (
            <DirectChatThread
              key={activePartnerId}
              partnerId={activePartnerId}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Select a conversation or start a new message.
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
