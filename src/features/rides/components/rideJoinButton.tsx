"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { leaveRide } from "../actions/leaveRide";
import { requestJoinRide } from "../actions/requestJoinRide";
import { withdrawJoinRequest } from "../actions/withdrawJoinRequest";
import { invalidateRideQueries } from "../lib/rideQueryKeys";
import type { RideParticipantStatus, RideStatus } from "../types";

type RideJoinButtonProps = {
  rideId: string;
  isCreator: boolean;
  participantStatus: RideParticipantStatus | null;
  rideStatus?: RideStatus;
  isFull?: boolean;
  isPast?: boolean;
  className?: string;
};

type ActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

export function RideJoinButton({
  rideId,
  isCreator,
  participantStatus,
  rideStatus = "SCHEDULED",
  isFull = false,
  isPast = false,
  className,
}: RideJoinButtonProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const useRideAction = (action: (rideId: string) => Promise<ActionResult>) =>
    useMutation({
      mutationFn: async () => {
        const result = await action(rideId);
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

  const joinMutation = useRideAction(requestJoinRide);
  const leaveMutation = useRideAction(leaveRide);
  const withdrawMutation = useRideAction(withdrawJoinRequest);

  if (isCreator) {
    return (
      <Badge variant="secondary" className={className}>
        Your ride
      </Badge>
    );
  }

  if (rideStatus === "CANCELLED") {
    return (
      <Button size="sm" className={className} disabled>
        Cancelled
      </Button>
    );
  }

  if (participantStatus === "APPROVED") {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" className={className}>
            Leave ride
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this ride?</AlertDialogTitle>
            <AlertDialogDescription>
              Your spot is given up. You can request to join again later as long
              as the ride has open spots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              disabled={leaveMutation.isPending}
              onClick={() => leaveMutation.mutate()}
            >
              {leaveMutation.isPending && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Leave ride
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (participantStatus === "PENDING") {
    return (
      <Button
        size="sm"
        variant="outline"
        className={className}
        disabled={withdrawMutation.isPending}
        onClick={() => withdrawMutation.mutate()}
      >
        {withdrawMutation.isPending && (
          <Loader2Icon className="size-4 animate-spin" />
        )}
        Withdraw request
      </Button>
    );
  }

  if (participantStatus === "WAITLISTED") {
    return (
      <Button
        size="sm"
        variant="outline"
        className={className}
        disabled={withdrawMutation.isPending}
        onClick={() => withdrawMutation.mutate()}
      >
        {withdrawMutation.isPending && (
          <Loader2Icon className="size-4 animate-spin" />
        )}
        On waitlist — leave
      </Button>
    );
  }

  if (participantStatus === "REJECTED") {
    return (
      <Button
        size="sm"
        variant="outline"
        className={className}
        disabled={joinMutation.isPending}
        onClick={() => joinMutation.mutate()}
      >
        {joinMutation.isPending && (
          <Loader2Icon className="size-4 animate-spin" />
        )}
        Request again
      </Button>
    );
  }

  if (isPast) {
    return (
      <Badge variant="outline" className={className}>
        Ride ended
      </Badge>
    );
  }

  if (isFull) {
    return (
      <Button
        size="sm"
        variant="outline"
        className={className}
        disabled={joinMutation.isPending}
        onClick={() => joinMutation.mutate()}
      >
        {joinMutation.isPending && (
          <Loader2Icon className="size-4 animate-spin" />
        )}
        Join waitlist
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className={className}
      disabled={joinMutation.isPending}
      onClick={() => joinMutation.mutate()}
    >
      {joinMutation.isPending && (
        <Loader2Icon className="size-4 animate-spin" />
      )}
      Request Join
    </Button>
  );
}
