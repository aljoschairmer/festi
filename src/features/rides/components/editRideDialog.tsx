"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateRide } from "../actions/updateRide";
import { RIDE_DIFFICULTY_OPTIONS, RIDE_PACE_OPTIONS } from "../lib/format";
import { invalidateRideQueries } from "../lib/rideQueryKeys";
import { type UpdateRideFormValues, updateRideFormSchema } from "../schemas";
import type { RideDetail, RideDifficulty, RidePace } from "../types";

/** Radix Select items can't use an empty string, so "none" means unset. */
const NONE = "none";

type EditableRide = Pick<
  RideDetail,
  | "id"
  | "title"
  | "description"
  | "startTime"
  | "pace"
  | "difficulty"
  | "maxParticipants"
>;

/** Converts an ISO timestamp to a `datetime-local` input value. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function defaultsFrom(ride: EditableRide): UpdateRideFormValues {
  return {
    title: ride.title,
    description: ride.description ?? "",
    startTime: toLocalInputValue(ride.startTime),
    pace: ride.pace ?? undefined,
    difficulty: ride.difficulty ?? undefined,
    maxParticipants: ride.maxParticipants?.toString() ?? "",
  };
}

export function EditRideDialog({ ride }: { ride: EditableRide }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateRideFormValues>({
    resolver: zodResolver(updateRideFormSchema),
    defaultValues: defaultsFrom(ride),
  });

  const mutation = useMutation({
    mutationFn: async (values: UpdateRideFormValues) => {
      const result = await updateRide(ride.id, {
        title: values.title,
        description: values.description,

        startTime: new Date(values.startTime).toISOString(),
        pace: values.pace ?? null,
        difficulty: values.difficulty ?? null,
        maxParticipants:
          values.maxParticipants === "" ? null : Number(values.maxParticipants),
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (result) => {
      invalidateRideQueries(queryClient);
      toast.success(result.message);
      router.refresh();
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const pace = watch("pace");
  const difficulty = watch("difficulty");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset(defaultsFrom(ride));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon className="size-4" />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <DialogHeader>
            <DialogTitle>Edit ride</DialogTitle>
            <DialogDescription>
              Update the details of this ride. Approved riders are notified when
              the start time changes.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="edit-ride-title">Title</FieldLabel>
              <Input
                id="edit-ride-title"
                placeholder="Sunday Morning Ride"
                {...register("title")}
                aria-invalid={!!errors.title}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field data-invalid={!!errors.startTime}>
              <FieldLabel htmlFor="edit-ride-startTime">Start time</FieldLabel>
              <Input
                id="edit-ride-startTime"
                type="datetime-local"
                {...register("startTime")}
                aria-invalid={!!errors.startTime}
              />
              <FieldError errors={[errors.startTime]} />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="edit-ride-description">
                Description
              </FieldLabel>
              <Textarea
                id="edit-ride-description"
                rows={3}
                placeholder="Where are we heading?"
                {...register("description")}
                aria-invalid={!!errors.description}
              />
              <FieldError errors={[errors.description]} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="edit-ride-pace">Pace</FieldLabel>
                <Select
                  value={pace ?? NONE}
                  onValueChange={(value) =>
                    setValue(
                      "pace",
                      value === NONE ? undefined : (value as RidePace),
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger id="edit-ride-pace" className="w-full">
                    <SelectValue placeholder="No pace set" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value={NONE}>No pace set</SelectItem>
                    {RIDE_PACE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-ride-difficulty">
                  Difficulty
                </FieldLabel>
                <Select
                  value={difficulty ?? NONE}
                  onValueChange={(value) =>
                    setValue(
                      "difficulty",
                      value === NONE ? undefined : (value as RideDifficulty),
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger id="edit-ride-difficulty" className="w-full">
                    <SelectValue placeholder="No difficulty set" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value={NONE}>No difficulty set</SelectItem>
                    {RIDE_DIFFICULTY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field data-invalid={!!errors.maxParticipants}>
              <FieldLabel htmlFor="edit-ride-maxParticipants">
                Max riders
              </FieldLabel>
              <Input
                id="edit-ride-maxParticipants"
                type="number"
                inputMode="numeric"
                min={2}
                max={200}
                placeholder="No limit"
                {...register("maxParticipants")}
                aria-invalid={!!errors.maxParticipants}
              />
              <FieldError errors={[errors.maxParticipants]} />
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
              {mutation.isPending && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
