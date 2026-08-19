"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SendIcon, SmileIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useChatStream } from "@/hooks/useChatStream";
import { UNREAD_BADGES_KEY } from "@/hooks/useUnreadBadges";
import {
  type DirectMessagesResult,
  getDirectMessages,
  sendDirectMessage,
} from "../actions/direct-chat-action";
import { DirectMessageSchema } from "../schemas";

const emojis = [
  "😀",
  "😂",
  "😍",
  "🔥",
  "🚴",
  "💪",
  "👍",
  "❤️",
  "🎉",
  "😎",
  "😢",
  "😡",
];

/** Accessible names for the emoji picker buttons (the glyph alone is not one). */
const emojiNames: Record<string, string> = {
  "😀": "grinning face",
  "😂": "face with tears of joy",
  "😍": "smiling face with heart-eyes",
  "🔥": "fire",
  "🚴": "cyclist",
  "💪": "flexed biceps",
  "👍": "thumbs up",
  "❤️": "red heart",
  "🎉": "party popper",
  "😎": "smiling face with sunglasses",
  "😢": "crying face",
  "😡": "enraged face",
};

type FormValues = {
  recipientId: string;
  content: string;
};

export function DirectChatThread({ partnerId }: { partnerId: string }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(DirectMessageSchema),
    defaultValues: {
      content: "",
      recipientId: partnerId,
    },
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const { refetchInterval } = useChatStream<DirectMessagesResult>(
    `/api/chat/direct/${partnerId}`,
    ["direct-chat", partnerId],
  );

  const { data, isLoading, isError, refetch } = useQuery<DirectMessagesResult>({
    queryKey: ["direct-chat", partnerId],
    queryFn: () => getDirectMessages(partnerId),
    refetchInterval,
  });

  const messages = data?.messages ?? [];
  const partner = data?.partner;
  const canMessage = data?.canMessage ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: react to new reads
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: UNREAD_BADGES_KEY });
    queryClient.invalidateQueries({ queryKey: ["direct-conversations"] });
  }, [data?.messages.length, queryClient]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => sendDirectMessage(values),
    onSuccess: () => {
      form.reset({ content: "", recipientId: partnerId });
      queryClient.invalidateQueries({ queryKey: ["direct-chat", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["direct-conversations"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b p-3">
        <div className="relative">
          <Avatar className="size-9">
            <AvatarImage
              src={partner?.image ?? undefined}
              alt={partner?.name}
            />
            <AvatarFallback>
              {partner?.name?.slice(0, 2).toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          {partner?.isOnline ? (
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-green-500" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {partner?.name ?? "Loading..."}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            @{partner?.username ?? "rider"}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-primary">
              Failed to load the conversation.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[75%] space-y-1">
                <div
                  className={`break-all rounded-2xl px-4 py-2 text-sm ${
                    message.fromMe
                      ? "rounded-br-sm bg-primary text-white"
                      : "rounded-bl-sm bg-muted text-foreground"
                  }`}
                >
                  {message.content}
                </div>
                <div
                  className={`text-xs text-muted-foreground ${
                    message.fromMe ? "text-right" : "text-left"
                  }`}
                >
                  {new Intl.DateTimeFormat("en", {
                    timeStyle: "short",
                  }).format(new Date(message.createdAt))}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {canMessage ? (
        <form
          className="flex gap-2 border-t p-3"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <Field
            className="flex-1"
            data-invalid={!!form.formState.errors.content}
          >
            <Input
              placeholder="Write a message..."
              maxLength={200}
              {...form.register("content")}
            />
            <FieldError errors={[form.formState.errors.content]} />
          </Field>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Pick emoji"
              >
                <SmileIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="grid grid-cols-6 gap-2">
                {emojis.map((emoji) => (
                  <Button
                    key={emoji}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={emojiNames[emoji] ?? emoji}
                    onClick={() => {
                      const currentValue = form.getValues("content");
                      form.setValue("content", currentValue + emoji, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            disabled={mutation.isPending || !form.watch("content").trim()}
            type="submit"
            aria-label="Send message"
          >
            <SendIcon className="size-4" />
          </Button>
        </form>
      ) : (
        <div className="border-t p-3 text-center text-xs text-muted-foreground">
          You can only message riders who follow you back.
        </div>
      )}
    </div>
  );
}
