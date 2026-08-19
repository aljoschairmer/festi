"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, LinkIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setRidePublic } from "../actions/setRidePublic";
import { invalidateRideQueries } from "../lib/rideQueryKeys";

/**
 * Creator control for the public (logged-out) ride page: a switch to enable
 * it and a button to copy the shareable link.
 */
export function PublicRideLink({
  rideId,
  isPublic,
}: {
  rideId: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const result = await setRidePublic(rideId, next);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (result) => {
      invalidateRideQueries(queryClient);
      router.refresh();
      toast.success(result.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const copyLink = async () => {
    const url = `${window.location.origin}/rides/${rideId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Label
        htmlFor="public-link"
        className="flex cursor-pointer select-none items-center gap-2 text-sm font-normal"
      >
        <Switch
          id="public-link"
          checked={isPublic}
          disabled={mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate(checked)}
        />
        {mutation.isPending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <LinkIcon className="size-4" />
        )}
        Public link
      </Label>
      {isPublic && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyLink}
          aria-label="Copy public ride link"
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
          Copy link
        </Button>
      )}
    </div>
  );
}
