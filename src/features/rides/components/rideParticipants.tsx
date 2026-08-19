"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { markAttendance } from "../actions/markAttendance";
import { respondToJoinRequest } from "../actions/respondToJoinRequest";
import { invalidateRideQueries } from "../lib/rideQueryKeys";
import type { RideCreator, RideParticipantInfo } from "../types";

type RideParticipantsProps = {
  isCreator: boolean;
  creator: RideCreator;
  participants: RideParticipantInfo[];
  /** Null means unlimited spots. */
  maxParticipants: number | null;
  /** Past rides let the creator mark who actually showed up. */
  isPast?: boolean;
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function RiderChip({ user, host }: { user: RideCreator; host?: boolean }) {
  return (
    <Link
      href={`/dashboard/community/u/${user.id}`}
      prefetch={false}
      className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 transition-colors hover:bg-muted"
    >
      <Avatar className="size-6">
        <AvatarImage src={user.image ?? undefined} />
        <AvatarFallback className="text-xs">
          {initials(user.name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm">{user.username ?? user.name}</span>
      {host && (
        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          Host
        </span>
      )}
    </Link>
  );
}

export function RideParticipants({
  isCreator,
  creator,
  participants,
  maxParticipants,
  isPast = false,
}: RideParticipantsProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async (input: { participantId: string; approve: boolean }) => {
      const result = await respondToJoinRequest(
        input.participantId,
        input.approve,
      );
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

  const attendanceMutation = useMutation({
    mutationFn: async (input: { participantId: string; attended: boolean }) => {
      const result = await markAttendance(input.participantId, input.attended);
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

  const approved = participants.filter((p) => p.status === "APPROVED");
  const pending = participants.filter((p) => p.status === "PENDING");
  const waitlisted = participants.filter((p) => p.status === "WAITLISTED");

  return (
    <div className="flex flex-col gap-6">
      {isCreator && pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Join requests</h3>
          <ul className="flex flex-col gap-2">
            {pending.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center gap-3 rounded-lg border p-2"
              >
                <Avatar className="size-8">
                  <AvatarImage src={participant.user.image ?? undefined} />
                  <AvatarFallback>
                    {initials(participant.user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {participant.user.username ?? participant.user.name}
                </span>
                <Button
                  size="icon-sm"
                  variant="default"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      participantId: participant.id,
                      approve: true,
                    })
                  }
                  aria-label="Approve"
                >
                  {mutation.isPending ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CheckIcon className="size-4" />
                  )}
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      participantId: participant.id,
                      approve: false,
                    })
                  }
                  aria-label="Decline"
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isCreator && waitlisted.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            Waitlist
            <span className="ml-2 font-normal text-muted-foreground">
              moved up automatically when a spot frees
            </span>
          </h3>
          <ul className="flex flex-col gap-2">
            {waitlisted.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center gap-3 rounded-lg border p-2"
              >
                <Avatar className="size-8">
                  <AvatarImage src={participant.user.image ?? undefined} />
                  <AvatarFallback>
                    {initials(participant.user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {participant.user.username ?? participant.user.name}
                </span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      participantId: participant.id,
                      approve: false,
                    })
                  }
                  aria-label="Remove from waitlist"
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          Riders ({approved.length + 1})
          {maxParticipants !== null && (
            <span className="ml-2 font-normal text-muted-foreground">
              {approved.length}/{maxParticipants} spots filled
            </span>
          )}
          {isPast && approved.some((p) => p.attended !== null) && (
            <span className="ml-2 font-normal text-muted-foreground">
              {approved.filter((p) => p.attended === true).length} attended
            </span>
          )}
        </h3>
        {isPast && isCreator ? (
          <ul className="flex flex-col gap-2">
            <li>
              <RiderChip user={creator} host />
            </li>
            {approved.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center gap-3 rounded-lg border p-2"
              >
                <Avatar className="size-8">
                  <AvatarImage src={participant.user.image ?? undefined} />
                  <AvatarFallback>
                    {initials(participant.user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {participant.user.username ?? participant.user.name}
                </span>
                <Button
                  size="icon-sm"
                  variant={
                    participant.attended === true ? "default" : "outline"
                  }
                  disabled={attendanceMutation.isPending}
                  onClick={() =>
                    attendanceMutation.mutate({
                      participantId: participant.id,
                      attended: true,
                    })
                  }
                  aria-label={`Mark ${participant.user.name} as attended`}
                >
                  {attendanceMutation.isPending ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CheckIcon className="size-4" />
                  )}
                </Button>
                <Button
                  size="icon-sm"
                  variant={
                    participant.attended === false ? "destructive" : "outline"
                  }
                  disabled={attendanceMutation.isPending}
                  onClick={() =>
                    attendanceMutation.mutate({
                      participantId: participant.id,
                      attended: false,
                    })
                  }
                  aria-label={`Mark ${participant.user.name} as no-show`}
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-2">
            <li key={creator.id}>
              <RiderChip user={creator} host />
            </li>
            {approved.map((participant) => (
              <li key={participant.id}>
                <RiderChip user={participant.user} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
