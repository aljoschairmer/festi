"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2Icon, SendIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { addPostComment } from "../actions/addPostComment";
import { deletePostComment } from "../actions/deletePostComment";
import { getPostComments } from "../actions/getPostComments";
import type { PostAuthor } from "../types";

function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"
  );
}

function profileHref(author: PostAuthor) {
  return `/dashboard/community/u/${author.id}`;
}

export function PostComments({ postId }: { postId: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["post-comments", postId],
    queryFn: () => getPostComments(postId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  };

  const addMutation = useMutation({
    mutationFn: async (content: string) => {
      const result = await addPostComment(postId, content);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      setValue("");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const result = await deletePostComment(commentId);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) addMutation.mutate(value.trim());
        }}
        className="flex gap-2"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Write a comment…"
          maxLength={1000}
          disabled={addMutation.isPending}
        />
        <Button
          type="submit"
          size="icon"
          disabled={addMutation.isPending || value.trim() === ""}
          aria-label="Send comment"
        >
          {addMutation.isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SendIcon className="size-4" />
          )}
        </Button>
      </form>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-2/3 rounded-lg" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          No comments yet. Be the first!
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex gap-2 duration-300 animate-in fade-in"
            >
              <Link href={profileHref(comment.author)} prefetch={false}>
                <Avatar size="sm">
                  {comment.author.image && (
                    <AvatarImage
                      src={comment.author.image}
                      alt={comment.author.name}
                    />
                  )}
                  <AvatarFallback>
                    {initialsOf(comment.author.name)}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={profileHref(comment.author)}
                      prefetch={false}
                      className="text-xs font-medium hover:underline"
                    >
                      {comment.author.username ?? comment.author.name}
                    </Link>
                    {comment.isAuthor && (
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(comment.id)}
                        disabled={deleteMutation.isPending}
                        className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        aria-label="Delete comment"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </div>
                <p className="mt-0.5 pl-1 text-[0.7rem] text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
