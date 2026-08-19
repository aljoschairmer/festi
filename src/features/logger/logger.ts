import "server-only";

import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/clientIp";
import { prisma } from "@/lib/prisma";

/** Every activity we can log. Keep in sync with the Prisma `ActivityAction` enum. */
export const ActivityAction = {
  USER_REGISTERED: "USER_REGISTERED",
  USER_REGISTRATION_FAILED: "USER_REGISTRATION_FAILED",
  USER_LOGGED_IN: "USER_LOGGED_IN",
  USER_LOGIN_FAILED: "USER_LOGIN_FAILED",
  USER_LOGGED_OUT: "USER_LOGGED_OUT",
  USER_EMAIL_VERIFIED: "USER_EMAIL_VERIFIED",
  USER_UPDATED_PROFILE: "USER_UPDATED_PROFILE",
  USER_CHANGED_PASSWORD: "USER_CHANGED_PASSWORD",
  USER_BANNED: "USER_BANNED",
  USER_UNBANNED: "USER_UNBANNED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_FOLLOWED: "USER_FOLLOWED",
  USER_UNFOLLOWED: "USER_UNFOLLOWED",
  GROUP_CREATED: "GROUP_CREATED",
  GROUP_UPDATED: "GROUP_UPDATED",
  GROUP_DELETED: "GROUP_DELETED",
  GROUP_JOINED: "GROUP_JOINED",
  GROUP_LEFT: "GROUP_LEFT",
  GROUP_MEMBER_APPROVED: "GROUP_MEMBER_APPROVED",
  GROUP_MEMBER_REMOVED: "GROUP_MEMBER_REMOVED",
  GROUP_MESSAGE_SENT: "GROUP_MESSAGE_SENT",
  DIRECT_MESSAGE_SENT: "DIRECT_MESSAGE_SENT",
  RIDE_CREATED: "RIDE_CREATED",
  RIDE_UPDATED: "RIDE_UPDATED",
  RIDE_CANCELLED: "RIDE_CANCELLED",
  RIDE_JOIN_REQUESTED: "RIDE_JOIN_REQUESTED",
  RIDE_JOIN_APPROVED: "RIDE_JOIN_APPROVED",
  RIDE_JOIN_REJECTED: "RIDE_JOIN_REJECTED",
  RIDE_JOIN_WITHDRAWN: "RIDE_JOIN_WITHDRAWN",
  RIDE_LEFT: "RIDE_LEFT",
  RIDE_WAITLISTED: "RIDE_WAITLISTED",
  RIDE_WAITLIST_PROMOTED: "RIDE_WAITLIST_PROMOTED",
  RIDE_ATTENDANCE_MARKED: "RIDE_ATTENDANCE_MARKED",
  GROUP_JOIN_REQUESTED: "GROUP_JOIN_REQUESTED",
  GROUP_MEMBER_REJECTED: "GROUP_MEMBER_REJECTED",
  GROUP_MEMBER_ROLE_CHANGED: "GROUP_MEMBER_ROLE_CHANGED",
  GROUP_ANNOUNCEMENT_CREATED: "GROUP_ANNOUNCEMENT_CREATED",
  ROUTE_SAVED: "ROUTE_SAVED",
  ROUTE_DELETED: "ROUTE_DELETED",
  POST_CREATED: "POST_CREATED",
  POST_LIKED: "POST_LIKED",
  POST_COMMENTED: "POST_COMMENTED",
  OTHER: "OTHER",
} as const;

export type ActivityAction =
  (typeof ActivityAction)[keyof typeof ActivityAction];

type LogInput = {
  /** The typed activity that happened. */
  action: ActivityAction;
  /** Who performed the action. */
  actorId?: string | null;
  /** The user this action targets (e.g. the followed user). */
  targetUserId?: string | null;
  /** Polymorphic reference to any other entity, e.g. "group". */
  targetType?: string | null;
  targetId?: string | null;
  /** Extra structured context for analytics. */
  metadata?: Prisma.InputJsonValue | null;
};

/**
 * Reads request context (IP / user agent) from the incoming headers.
 * Returns empty values when called outside a request scope.
 */
async function getRequestContext() {
  try {
    const h = await headers();
    // `cf-connecting-ip` first — `x-forwarded-for` is client-settable, so the
    // audit trail (and the brute-force detection built on it) was forgeable.
    const ipAddress = await getClientIp();
    const userAgent = h.get("user-agent");
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Simple activity logger for server actions.
 *
 * @example
 * await Logger.log("USER_FOLLOWED", "User X followed User Y", {
 *   actorId: me.id,
 *   targetUserId: other.id,
 * });
 */
export const Logger = {
  async log(
    action: LogInput["action"],
    description: string,
    input: Omit<LogInput, "action"> = {},
  ) {
    try {
      const { ipAddress, userAgent } = await getRequestContext();

      await prisma.activityLog.create({
        data: {
          action,
          description,
          actorId: input.actorId ?? null,
          targetUserId: input.targetUserId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          metadata: input.metadata ?? undefined,
          ipAddress,
          userAgent,
        },
      });
    } catch (error) {
      // Logging must never break the action that triggered it.
      console.error("[Logger] Failed to write activity log:", error);
    }
  },
};
