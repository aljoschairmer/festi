"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { processImageToWebp } from "@/lib/imageProcessing";
import { updateGroup } from "../actions/updateGroup";
import { uploadGroupImage } from "../actions/uploadGroupImage";
import { type GroupFormData, groupFormSchema } from "../schemas";

export function EditGroupDialog({
  groupId,
  currentName,
  currentDescription,
  currentNeedApproval,
  currentImage,
}: {
  groupId: string;
  currentName: string;
  currentDescription: string;
  currentNeedApproval: boolean;
  currentImage: string | null;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(currentImage);
  const [processing, setProcessing] = useState(false);

  const resetImage = () => {
    setImageBlob(null);
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return currentImage;
    });
  };

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setProcessing(true);
    try {
      const webp = await processImageToWebp(file, {
        maxDimension: 1024,
        quality: 0.82,
      });
      setImageBlob(webp);
      setImagePreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(webp);
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to process image.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<GroupFormData>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: currentName,
      description: currentDescription,
      needApproval: currentNeedApproval,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: GroupFormData) => {
      const result = await updateGroup({
        groupId,
        name: values.name,
        description: values.description,
        needApproval: values.needApproval,
      });
      if (!result.success) {
        throw new Error(result.error);
      }

      if (imageBlob) {
        const formData = new FormData();
        formData.append("image", imageBlob, "cover.webp");
        const imageResult = await uploadGroupImage(groupId, formData);
        if (!imageResult.success) {
          toast.warning(`Group saved, but image failed: ${imageResult.error}`);
        }
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(data.message);
      setImageBlob(null);
      router.refresh();
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset({
            name: currentName,
            description: currentDescription,
            needApproval: currentNeedApproval,
          });
          resetImage();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <PencilIcon className="mr-2 size-4" />
          Edit Group
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <DialogHeader>
            <DialogTitle>Edit group</DialogTitle>
            <DialogDescription>
              Update this group&apos;s name and description.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel>Group image</FieldLabel>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processing || mutation.isPending}
                className="group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 outline-none ring-primary/50 transition-colors hover:border-primary/50 focus-visible:ring-2"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  // biome-ignore lint/performance/noImgElement: local blob-URL preview via URL.createObjectURL — next/image cannot optimize object URLs
                  <img
                    src={imagePreview}
                    alt="Group cover preview"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted-foreground">
                    {processing ? (
                      <Loader2Icon className="size-6 animate-spin" />
                    ) : (
                      <ImageIcon className="size-6" />
                    )}
                    <span className="text-xs">
                      {processing ? "Processing..." : "Click to change image"}
                    </span>
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImage}
              />
            </Field>

            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Group name</FieldLabel>
              <Input
                id="name"
                placeholder="Group name"
                {...register("name")}
                aria-invalid={!!errors.name}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                placeholder="Group description"
                {...register("description")}
                aria-invalid={!!errors.description}
              />
              <FieldError errors={[errors.description]} />
            </Field>

            <Field
              orientation="horizontal"
              className="justify-between rounded-lg border p-3"
            >
              <FieldLabel htmlFor="needApproval">Require approval</FieldLabel>
              <Switch
                id="needApproval"
                checked={watch("needApproval")}
                onCheckedChange={(checked) => setValue("needApproval", checked)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
