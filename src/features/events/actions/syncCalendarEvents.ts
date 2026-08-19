"use server";

import { type EventDetail, RadNet } from "radnet-breitensport";
import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import type { CalendarSyncResult } from "../types";

/** Re-scrape the calendar list at most this often. */
const LIST_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** A crashed sync releases its lock after this long. */
const LOCK_MS = 3 * 60 * 1000;
/** How far ahead the calendar is synced. */
const SYNC_WINDOW_MONTHS = 6;
/** Upper bound on list pages (30 events each) fetched per sync. */
const LIST_MAX_PAGES = 30;
/**
 * Detail pages fetched per call — the client keeps calling until done.
 * rad-net's waiting room kicks in after a handful of rapid requests, so the
 * batch stays tiny and the client pump provides the pause between batches.
 */
const DETAIL_BATCH = 3;
/** Polite pause between detail-page requests to rad-net. */
const DETAIL_DELAY_MS = 1_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startOfTodayUtc(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function countPendingDetails() {
  return prisma.radnetEvent.count({
    where: { detailSyncedAt: null, date: { gte: startOfTodayUtc() } },
  });
}

/**
 * Incrementally syncs the rad-net Breitensportkalender into the database.
 *
 * Each call does a bounded amount of work so it stays well under Cloudflare's
 * per-invocation subrequest limits and stays polite to rad-net: either one
 * list scrape (when the list is older than 12h) or one batch of detail pages
 * (coordinates, start location, cancellation state). The client keeps calling
 * while `pendingDetails > 0`, so coverage fills in progressively. A DB lock
 * row prevents concurrent visitors from scraping in parallel.
 */
export async function syncCalendarEvents(): Promise<CalendarSyncResult> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const now = new Date();

  await prisma.radnetSyncState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const acquired = await prisma.radnetSyncState.updateMany({
    where: {
      id: 1,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  if (acquired.count === 0) {
    return { locked: true, pendingDetails: await countPendingDetails() };
  }

  try {
    const state = await prisma.radnetSyncState.findUnique({ where: { id: 1 } });
    const listStale =
      !state?.listSyncedAt ||
      now.getTime() - state.listSyncedAt.getTime() > LIST_MAX_AGE_MS;

    const client = new RadNet();

    if (listStale) {
      await syncList(client, now);
    } else {
      await syncDetailBatch(client);
    }

    return { locked: false, pendingDetails: await countPendingDetails() };
  } finally {
    await prisma.radnetSyncState.update({
      where: { id: 1 },
      data: { lockedUntil: null },
    });
  }
}

/** Scrapes the list for the sync window and reconciles the cached rows. */
async function syncList(client: RadNet, now: Date) {
  const startDate = startOfTodayUtc();
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + SYNC_WINDOW_MONTHS);

  const items = await client.search({
    startDate,
    endDate,
    maxPages: LIST_MAX_PAGES,
  });

  for (const item of items) {
    const listFields = {
      type: item.type || undefined,
      date: new Date(item.date),
      title: item.title,
      distances: item.distances,
      club: item.club || null,
      lvAbbr: item.lvAbbr,
      detailUrl: item.detailUrl,
      struckThrough: item.struckThrough,
    };
    await prisma.radnetEvent.upsert({
      where: { id: item.id },
      update: listFields,
      create: { ...listFields, id: item.id, type: item.type },
    });
  }

  if (items.length > 0) {
    const lastFetchedDate = items.reduce(
      (max, item) => (item.date > max ? item.date : max),
      items[0].date,
    );
    await prisma.radnetEvent.deleteMany({
      where: {
        date: { gte: startDate, lte: new Date(lastFetchedDate) },
        id: { notIn: items.map((item) => item.id) },
      },
    });
    await prisma.radnetEvent.deleteMany({ where: { date: { lt: startDate } } });

    await prisma.radnetSyncState.update({
      where: { id: 1 },
      data: { listSyncedAt: now },
    });
  }
}

/**
 * rad-net answers with a "Bitte warten" waiting-room page (HTTP 200) when it
 * wants a client to back off. The parser then returns a shell with that title
 * and none of the usual detail fields — recognize it so we never store it.
 */
function isWaitingRoomPage(detail: EventDetail): boolean {
  return (
    detail.title === "Bitte warten" &&
    !detail.organizer &&
    !detail.startLocation
  );
}

/** Fetches detail pages (coordinates etc.) for a small batch of events. */
async function syncDetailBatch(client: RadNet) {
  const pending = await prisma.radnetEvent.findMany({
    where: { detailSyncedAt: null, date: { gte: startOfTodayUtc() } },
    orderBy: { date: "asc" },
    take: DETAIL_BATCH,
  });

  for (const event of pending) {
    try {
      const detail = await client.getEvent(event.detailUrl);
      if (isWaitingRoomPage(detail)) {
        return;
      }
      await prisma.radnetEvent.update({
        where: { id: event.id },
        data: {
          type: detail.type || undefined,
          distances: detail.distances.length ? detail.distances : undefined,
          landesverband: detail.landesverband,
          startZip: detail.startLocation?.zip ?? null,
          startCity: detail.startLocation?.city ?? null,
          startVenue: detail.startLocation?.venue ?? null,
          startTime: detail.startTime,
          website: detail.website,
          lat: detail.coordinates?.lat ?? null,
          lng: detail.coordinates?.lng ?? null,
          cancelled: detail.cancelled,
          cancelReason: detail.cancelReason,
          detailSyncedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`[radnet-sync] detail fetch failed for ${event.id}`, error);

      await prisma.radnetEvent.update({
        where: { id: event.id },
        data: { detailSyncedAt: new Date() },
      });
    }
    await sleep(DETAIL_DELAY_MS);
  }
}
