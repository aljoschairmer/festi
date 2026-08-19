"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import type { CalendarEvent } from "../types";

/**
 * Returns all upcoming events from the cached rad-net Breitensportkalender,
 * ordered by date. Events whose detail pass hasn't run yet come without
 * coordinates — the map simply skips them until the sync fills them in.
 */
/** Hard cap: the calendar syncs six months ahead. */
const MAX_EVENTS = 1000;

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const events = await prisma.radnetEvent.findMany({
    take: MAX_EVENTS,
    where: { date: { gte: today } },
    orderBy: [{ date: "asc" }, { title: "asc" }],
  });

  return events.map((event) => ({
    id: event.id,
    type: event.type,
    date: event.date.toISOString().slice(0, 10),
    title: event.title,
    distances: event.distances,
    club: event.club,
    lvAbbr: event.lvAbbr,
    detailUrl: event.detailUrl,
    startZip: event.startZip,
    startCity: event.startCity,
    startVenue: event.startVenue,
    startTime: event.startTime,
    website: event.website,
    lat: event.lat,
    lng: event.lng,
    // On the list, struck-through upcoming events are cancelled ones (past
    // events are already filtered out by the date bound above).
    cancelled: event.cancelled || event.struckThrough,
    cancelReason: event.cancelReason,
  }));
}
