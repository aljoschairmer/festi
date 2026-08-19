"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImagePlusIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { processImageToWebp } from "@/lib/imageProcessing";
import { cn } from "@/lib/utils";
import { deleteRidePhoto } from "../actions/deleteRidePhoto";
import { uploadRidePhoto } from "../actions/uploadRidePhoto";
import { MAX_RIDE_PHOTOS } from "../schemas";
import type { RidePhotoInfo } from "../types";

type RidePhotosProps = {
  rideId: string;
  photos: RidePhotoInfo[];
  canManage: boolean;
  title: string;
};

export function RidePhotos({
  rideId,
  photos,
  canManage,
  title,
}: RidePhotosProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const remaining = MAX_RIDE_PHOTOS - photos.length;

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (remaining <= 0) {
      toast.error(`You can add up to ${MAX_RIDE_PHOTOS} photos.`);
      return;
    }

    const queue = files.slice(0, remaining);
    setBusy(true);
    setUploadProgress({ done: 0, total: queue.length });
    let failed = false;
    try {
      for (const file of queue) {
        const webp = await processImageToWebp(file, {
          maxDimension: 1600,
          quality: 0.82,
        });
        const formData = new FormData();
        formData.append("image", webp, "photo.webp");
        const result = await uploadRidePhoto(rideId, formData);
        if (!result.success) {
          failed = true;
          toast.error(result.error);
          break;
        }
        setUploadProgress((prev) =>
          prev ? { ...prev, done: prev.done + 1 } : prev,
        );
      }
      if (!failed) {
        toast.success(
          queue.length === 1 ? "Photo uploaded." : "Photos uploaded.",
        );
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to process photo.",
      );
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (photoId: string) => {
    setBusy(true);
    const result = await deleteRidePhoto(photoId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Photo removed.");
    router.refresh();
  };

  if (photos.length === 0 && !canManage) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Ride photos</h2>
        {canManage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={handleFiles}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || remaining <= 0}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ImagePlusIcon className="size-4" />
              )}
              Add photos
              <span className="text-muted-foreground">
                {photos.length}/{MAX_RIDE_PHOTOS}
              </span>
            </Button>
          </>
        )}
      </div>

      {busy && uploadProgress && (
        <output className="flex items-center gap-3" aria-live="polite">
          <Progress
            value={(uploadProgress.done / uploadProgress.total) * 100}
            className="flex-1"
            aria-label="Photo upload progress"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            Uploading {uploadProgress.done}/{uploadProgress.total}…
          </span>
        </output>
      )}

      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
          Share up to {MAX_RIDE_PHOTOS} photos from the ride.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="size-full"
              >
                {/* biome-ignore lint/performance/noImgElement: R2 URLs, not optimized */}
                <img
                  src={photo.url}
                  alt={`${title} ${index + 1}`}
                  loading="lazy"
                  className="size-full cursor-pointer object-cover transition-transform group-hover:scale-105"
                />
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleDelete(photo.id)}
                  disabled={busy}
                  aria-label="Delete photo"
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <RidePhotoLightbox
        photos={photos}
        index={openIndex}
        title={title}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </div>
  );
}

function RidePhotoLightbox({
  photos,
  index,
  title,
  onIndexChange,
  onClose,
}: {
  photos: RidePhotoInfo[];
  index: number | null;
  title: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const count = photos.length;

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  const current = index !== null ? photos[index] : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton
        className="max-w-3xl border-0 bg-transparent p-0 ring-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {current && (
          <div className="relative flex items-center justify-center">
            {/* biome-ignore lint/performance/noImgElement: R2 URLs, not optimized */}
            <img
              src={current.url}
              alt={title}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                  className={cn(
                    "absolute left-2 flex size-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70",
                  )}
                >
                  <ChevronLeftIcon className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next photo"
                  className="absolute right-2 flex size-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                >
                  <ChevronRightIcon className="size-6" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                  {(index ?? 0) + 1} / {count}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
