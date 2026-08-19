"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CameraIcon, Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { uploadAvatar } from "@/features/users/actions/uploadAvatar";
import { processImageToWebp } from "@/lib/imageProcessing";

type AvatarUploaderProps = {
  name: string;
  image: string | null;
};

export function AvatarUploader({ name, image }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<string | null>(image);
  const [uploading, setUploading] = useState(false);

  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const openPicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    setUploading(true);
    try {
      const webp = await processImageToWebp(file, {
        maxDimension: 512,
        square: true,
        quality: 0.85,
      });

      const formData = new FormData();
      formData.append("image", webp, "avatar.webp");

      const result = await uploadAvatar(formData);
      if (!result.success) {
        throw new Error(result.error);
      }

      setPreview(result.imageUrl);
      queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload image.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={openPicker}
        disabled={uploading}
        aria-label="Change profile picture"
        className="group relative rounded-full outline-none ring-primary/50 focus-visible:ring-2"
      >
        <Avatar className="size-24">
          {preview ? <AvatarImage src={preview} alt={name} /> : null}
          <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
        </Avatar>

        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? (
            <Loader2Icon className="size-6 animate-spin text-white" />
          ) : (
            <CameraIcon className="size-6 text-white" />
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={openPicker}
        disabled={uploading}
        className="text-sm text-primary hover:text-primary-hover disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Change photo"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
