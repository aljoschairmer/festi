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
import { getGroupMessages, sendGroupMessage } from "../actions/chat-action";
import { type MessageFormData, MessageSchema } from "../schemas";

type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  isUserStillMember: boolean;
  user: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
  };
};

type ChatData = {
  currentUserId: string;
  messages: ChatMessage[];
};

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

export function GroupChat({ groupId }: { groupId: string }) {
  const form = useForm<MessageFormData>({
    resolver: zodResolver(MessageSchema),
    defaultValues: {
      content: "",
      groupId: groupId,
    },
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<ChatData>({
    queryKey: ["group-chat", groupId],
    queryFn: () => getGroupMessages(groupId),
    refetchInterval: 2000,
  });

  const messages = data?.messages ?? [];
  const currentUserId = data?.currentUserId;

  const mutation = useMutation({
    mutationFn: (values: MessageFormData) => sendGroupMessage(values),
    onSuccess: () => {
      form.reset();
      queryClient.invalidateQueries({
        queryKey: ["group-chat", groupId],
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger — scroll to bottom only when the message count changes; the effect body touches nothing but a ref
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className=" flex h-[520px] flex-col rounded-lg border bg-background">
      <div className="  flex-1 space-y-4 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-500">
              Failed to load the conversation.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((chatMessage) => {
            const isOwnMessage = chatMessage.user.id === currentUserId;
            const displayName = chatMessage.user.name;

            return (
              <div
                key={chatMessage.id}
                className={`flex gap-2 ${
                  isOwnMessage ? "justify-end" : "justify-start"
                }`}
              >
                {!isOwnMessage && (
                  <Avatar className="size-8">
                    <AvatarImage
                      src={
                        chatMessage.isUserStillMember
                          ? (chatMessage.user.image ?? undefined)
                          : undefined
                      }
                    />
                    <AvatarFallback>
                      {chatMessage.isUserStillMember
                        ? chatMessage.user.name.slice(0, 2).toUpperCase()
                        : "?"}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={`max-w-[75%] space-y-1 ${
                    isOwnMessage ? "items-end text-right" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{displayName}</span>
                    <span>
                      {new Intl.DateTimeFormat("en", {
                        timeStyle: "short",
                      }).format(new Date(chatMessage.createdAt))}
                    </span>
                  </div>

                  <div
                    className={`break-all rounded-2xl px-4 py-2 text-sm ${
                      isOwnMessage
                        ? "rounded-br-sm bg-red-500 text-white"
                        : "rounded-bl-sm bg-muted text-foreground"
                    } ${!chatMessage.isUserStillMember ? "italic" : ""}`}
                  >
                    {chatMessage.isUserStillMember
                      ? chatMessage.content
                      : "<user not a member anymore>"}
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

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
            aria-invalid={!!form.formState.errors.content}
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
    </div>
  );
}
