"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BanIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cancelRide } from "../actions/cancelRide";
import { invalidateRideQueries } from "../lib/rideQueryKeys";

export function CancelRideButton({
  rideId,
  hasSeries = false,
}: {
  rideId: string;
  /** True when the ride belongs to a weekly recurring series. */
  hasSeries?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelSeries, setCancelSeries] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await cancelRide(rideId, cancelSeries);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (result) => {
      invalidateRideQueries(queryClient);
      toast.success(result.message);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BanIcon className="size-4" />
          Cancel ride
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this ride?</AlertDialogTitle>
          <AlertDialogDescription>
            The ride stays visible but is marked as cancelled. Everyone who
            requested to join, was approved, or is on the waitlist will be
            notified.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasSeries && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="cancel-series"
              checked={cancelSeries}
              onCheckedChange={(checked) => setCancelSeries(checked === true)}
            />
            <Label htmlFor="cancel-series" className="text-sm font-normal">
              Also cancel all future rides in this weekly series
            </Label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep ride</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            Cancel ride
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
