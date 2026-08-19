"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ImagePlusIcon,
  Loader2Icon,
  PenSquareIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { processImageToWebp } from "@/lib/imageProcessing";
import { createPost } from "../actions/createPost";
import { uploadPostImage } from "../actions/uploadPostImage";
import {
  MAX_POST_IMAGES,
  type PostFormValues,
  postFormSchema,
} from "../schemas";
import { MarkdownEditor } from "./markdownEditor";

type SelectedImage = { blob: Blob; preview: string };

type CreatePostFormProps = {
  authorName: string;
  authorImage: string | null;
};

export function CreatePostForm({
  authorName,
  authorImage,
}: CreatePostFormProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [processing, setProcessing] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: { title: "", content: "" },
  });

  const clearImages = () => {
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.preview);
      return [];
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_POST_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_POST_IMAGES} images.`);
      return;
    }

    setProcessing(true);
    try {
      const selected: SelectedImage[] = [];
      for (const file of files.slice(0, remaining)) {
        const webp = await processImageToWebp(file, {
          maxDimension: 1600,
          quality: 0.82,
        });
        selected.push({ blob: webp, preview: URL.createObjectURL(webp) });
      }
      setImages((prev) => [...prev, ...selected]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to process image.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: PostFormValues) => {
      const result = await createPost(values);
      if (!result.success) {
        throw new Error(result.error);
      }

      for (let i = 0; i < images.length; i++) {
        const formData = new FormData();
        formData.append("image", images[i].blob, `${i}.webp`);
        const imageResult = await uploadPostImage(result.postId, i, formData);
        if (!imageResult.success) {
          toast.warning(
            `Post shared, but an image failed: ${imageResult.error}`,
          );
        }
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(data.message);
      reset();
      clearImages();
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const initials = authorName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          clearImages();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <PenSquareIcon className="size-4" />
          Create post
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create a post</DialogTitle>
          <DialogDescription>
            Share a ride, a route, or a tip with the community.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex gap-3"
        >
          <Avatar size="lg" className="mt-1 hidden sm:flex">
            {authorImage && <AvatarImage src={authorImage} alt={authorName} />}
            <AvatarFallback>{initials || "U"}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="post-title" className="sr-only">
                Title
              </FieldLabel>
              <Input
                id="post-title"
                placeholder="Give your post a title…"
                disabled={isSubmitting}
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && <FieldError>{errors.title.message}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.content}>
              <FieldLabel htmlFor="post-content" className="sr-only">
                Content
              </FieldLabel>
              <Controller
                control={control}
                name="content"
                render={({ field }) => (
                  <MarkdownEditor
                    id="post-content"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                    placeholder="Share your ride, a route, a tip… Markdown and links are supported."
                  />
                )}
              />
              {errors.content && (
                <FieldError>{errors.content.message}</FieldError>
              )}
            </Field>

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, index) => (
                  <div
                    key={img.preview}
                    className="group relative aspect-video overflow-hidden rounded-md border"
                  >
                    {/* biome-ignore lint/performance/noImgElement: local object URL preview */}
                    <img
                      src={img.preview}
                      alt={`Attachment ${index + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={handleFiles}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  isSubmitting || processing || images.length >= MAX_POST_IMAGES
                }
                onClick={() => fileInputRef.current?.click()}
              >
                {processing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <ImagePlusIcon className="size-4" />
                )}
                Photos
                <span className="text-muted-foreground">
                  {images.length}/{MAX_POST_IMAGES}
                </span>
              </Button>

              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SendIcon className="size-4" />
                )}
                Post
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
