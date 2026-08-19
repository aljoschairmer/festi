"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { followRider } from "../actions/followRider";
import { unfollowRider } from "../actions/unfollowRider";

type FollowRiderButtonProps = {
  targetId: string;
  isFollowing?: boolean;
};

const FollowRiderButton = ({
  targetId,
  isFollowing,
}: FollowRiderButtonProps) => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const result = await unfollowRider({ targetId });

      if (!result.success) {
        throw new Error(result.message);
      }

      return result;
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["rider-profile", targetId],
      });
      // The network sheet no longer polls, so it has to be told.
      queryClient.invalidateQueries({ queryKey: ["follow-connections"] });

      router.refresh();

      toast.success(data.message);
    },

    onError: (error) => {
      toast.error(error?.message ?? "An error occurred");
    },
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const result = await followRider({ targetId });

      if (!result.success) {
        throw new Error(result.message);
      }

      return result;
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["rider-profile", targetId],
      });
      // The network sheet no longer polls, so it has to be told.
      queryClient.invalidateQueries({ queryKey: ["follow-connections"] });

      router.refresh();

      toast.success(data.message);
    },

    onError: (error) => {
      toast.error(error?.message ?? "An error occurred");
    },
  });

  return (
    <Button
      onClick={() => {
        if (isFollowing) {
          unfollowMutation.mutate();
        } else {
          followMutation.mutate();
        }
      }}
      disabled={followMutation.isPending || unfollowMutation.isPending}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isFollowing ? "Unfollow" : "Follow"}
    </Button>
  );
};

export default FollowRiderButton;
