"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  HeartIcon,
  Loader2Icon,
  MessageCircleIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deletePost } from "../actions/deletePost";
import { togglePostLike } from "../actions/togglePostLike";
import { renderMarkdown } from "../lib/markdown";
import type { PostSummary } from "../types";
import { ImageLightbox } from "./imageLightbox";
import { PostComments } from "./postComments";

type PostCardProps = {
  post: PostSummary;
};

export function PostCard({ post }: PostCardProps) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  useEffect(() => {
    setLiked(post.likedByMe);
    setLikeCount(post.likeCount);
  }, [post.likedByMe, post.likeCount]);

  const likeMutation = useMutation({
    mutationFn: async () => {
      const result = await togglePostLike(post.id);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onMutate: () => {
      setLiked((v) => !v);
      setLikeCount((c) => c + (liked ? -1 : 1));
    },
    onSuccess: (result) => {
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    },
    onError: (error) => {
      setLiked(post.likedByMe);
      setLikeCount(post.likeCount);
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deletePost(post.id);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post deleted.");
    },
    onError: (error) => toast.error(error.message),
  });

  const authorLabel = post.author.username ?? post.author.name;
  const profileHref = `/dashboard/community/u/${post.author.id}`;
  const initials = post.author.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="rounded-xl border border-primary/20 bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start gap-3">
            <Link href={profileHref} prefetch={false} aria-label={authorLabel}>
              <Avatar>
                {post.author.image && (
                  <AvatarImage src={post.author.image} alt={authorLabel} />
                )}
                <AvatarFallback>{initials || "U"}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={profileHref}
                prefetch={false}
                className="block truncate font-medium leading-tight hover:underline"
              >
                {authorLabel}
              </Link>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
            {post.isAuthor && (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label="Delete post"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        deleteMutation.mutate();
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending && (
                        <Loader2Icon className="size-4 animate-spin" />
                      )}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div>
            <h2 className="font-heading text-lg font-semibold">{post.title}</h2>
            <div className="mt-1 text-sm text-foreground/90">
              {renderMarkdown(post.content)}
            </div>
          </div>
        </div>

        {post.images.length > 0 && (
          <div className="lg:w-56 lg:shrink-0">
            <PostGallery post={post} />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-1 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 text-muted-foreground",
            liked && "text-primary hover:text-primary",
          )}
          disabled={likeMutation.isPending}
          onClick={() => likeMutation.mutate()}
          aria-pressed={liked}
          aria-label={liked ? "Unlike post" : "Like post"}
        >
          <HeartIcon
            className={cn(
              "size-4 transition-transform",
              liked && "fill-current scale-110",
            )}
          />
          {likeCount > 0 && likeCount}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 text-muted-foreground",
            showComments && "text-foreground",
          )}
          onClick={() => setShowComments((v) => !v)}
          aria-label={showComments ? "Hide comments" : "Show comments"}
          aria-expanded={showComments}
        >
          <MessageCircleIcon className="size-4" />
          {post.commentCount > 0 ? post.commentCount : "Comment"}
        </Button>
      </div>

      {showComments && <PostComments postId={post.id} />}
    </article>
  );
}

function PostGallery({ post }: { post: PostSummary }) {
  const count = post.images.length;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <div
        className={cn(
          "grid h-36 gap-1.5 overflow-hidden rounded-lg lg:h-full lg:max-h-44",
          count === 1 && "grid-cols-1",
          count >= 2 && "grid-cols-2",
        )}
      >
        {post.images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            className={cn(
              "block overflow-hidden bg-muted",
              count === 3 && index === 0 && "col-span-2",
            )}
          >
            {/* biome-ignore lint/performance/noImgElement: R2 URLs, not optimized */}
            <img
              src={image.url}
              alt={`${post.title} attachment ${index + 1}`}
              loading="lazy"
              className="size-full cursor-pointer object-cover transition-transform hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      <ImageLightbox
        images={post.images}
        index={openIndex}
        title={post.title}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
