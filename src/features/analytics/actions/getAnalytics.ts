"use server";

import { getCurrentAdmin } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { TIME_RANGE_DAYS, timeRangeSchema } from "../schemas";
import type {
  AnalyticsData,
  AnalyticsWarning,
  RecentActivityEntry,
  TimeSeriesPoint,
  TopActor,
} from "../types";

const DAY_MS = 1000 * 60 * 60 * 24;

/** Buckets raw `{ day, count }` rows into a continuous, gap-filled series. */
function fillDailySeries(
  rows: { day: Date; count: number }[],
  since: Date,
  days: number,
): TimeSeriesPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.day.toISOString().slice(0, 10), Number(row.count));
  }

  const series: TimeSeriesPoint[] = [];
  const start = new Date(since);
  start.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i <= days; i++) {
    const date = new Date(start.getTime() + i * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }

  return series;
}

export async function getAnalytics(range?: string): Promise<AnalyticsData> {
  const session = await getCurrentAdmin();
  if (!session) {
    throw new Error("You are not authorized.");
  }

  const parsedRange = timeRangeSchema.parse(range);
  const days = TIME_RANGE_DAYS[parsedRange];

  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);
  const last24h = new Date(now.getTime() - DAY_MS);

  const [
    totalUsers,
    bannedUsers,
    newUsers,
    totalGroups,
    totalFollows,
    totalMessages,
    totalEvents,
    onlineSessions,
    eventsByActionRaw,
    activityByDayRaw,
    registrationsByDayRaw,
    topActorsRaw,
    recentActivityRaw,
    failedLogins24h,
    failedRegistrations24h,
    bans24h,
    suspiciousIps,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { banned: true } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.group.count(),
    prisma.follow.count(),
    prisma.groupMessage.count(),
    prisma.activityLog.count({ where: { createdAt: { gte: since } } }),
    prisma.session.findMany({
      where: { expiresAt: { gt: now } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.activityLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count
      FROM activity_log
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count
      FROM "user"
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.activityLog.groupBy({
      by: ["actorId"],
      where: { createdAt: { gte: since }, actorId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { actorId: "desc" } },
      take: 5,
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        actor: { select: { name: true, email: true } },
      },
    }),
    prisma.activityLog.count({
      where: { action: "USER_LOGIN_FAILED", createdAt: { gte: last24h } },
    }),
    prisma.activityLog.count({
      where: {
        action: "USER_REGISTRATION_FAILED",
        createdAt: { gte: last24h },
      },
    }),
    prisma.activityLog.count({
      where: { action: "USER_BANNED", createdAt: { gte: last24h } },
    }),
    prisma.$queryRaw<{ ip: string; count: number }[]>`
      SELECT "ipAddress" AS ip, count(*)::int AS count
      FROM activity_log
      WHERE action = 'USER_LOGIN_FAILED'
        AND "createdAt" >= ${last24h}
        AND "ipAddress" IS NOT NULL
      GROUP BY "ipAddress"
      HAVING count(*) >= 5
      ORDER BY count DESC
      LIMIT 5
    `,
  ]);

  const topActorIds = topActorsRaw
    .map((row) => row.actorId)
    .filter((id): id is string => id !== null);

  const topActorUsers = topActorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topActorIds } },
        select: { id: true, name: true, email: true, image: true },
      })
    : [];

  const userById = new Map(topActorUsers.map((u) => [u.id, u]));

  const topActors: TopActor[] = topActorsRaw
    .map((row) => {
      const user = row.actorId ? userById.get(row.actorId) : undefined;
      if (!user) return null;
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        count: row._count._all,
      };
    })
    .filter((a): a is TopActor => a !== null);

  const recentActivity: RecentActivityEntry[] = recentActivityRaw.map(
    (entry) => ({
      id: entry.id,
      action: entry.action,
      description: entry.description,
      actorName: entry.actor?.name ?? null,
      actorEmail: entry.actor?.email ?? null,
      targetType: entry.targetType,
      ipAddress: entry.ipAddress,
      createdAt: entry.createdAt.toISOString(),
    }),
  );

  const warnings: AnalyticsWarning[] = [];

  if (failedLogins24h > 0) {
    warnings.push({
      id: "failed-logins",
      level: failedLogins24h >= 20 ? "critical" : "warning",
      title: "Failed login attempts",
      description: `${failedLogins24h} failed login attempt(s) in the last 24 hours.`,
      count: failedLogins24h,
    });
  }

  if (failedRegistrations24h > 0) {
    warnings.push({
      id: "failed-registrations",
      level: failedRegistrations24h >= 20 ? "warning" : "info",
      title: "Failed registrations",
      description: `${failedRegistrations24h} failed registration attempt(s) in the last 24 hours.`,
      count: failedRegistrations24h,
    });
  }

  for (const row of suspiciousIps) {
    warnings.push({
      id: `suspicious-ip-${row.ip}`,
      level: "critical",
      title: "Repeated failed logins from one IP",
      description: `${row.count} failed logins from ${row.ip} in the last 24 hours — possible brute-force attempt.`,
      count: row.count,
    });
  }

  if (bans24h > 0) {
    warnings.push({
      id: "recent-bans",
      level: "info",
      title: "Recent bans",
      description: `${bans24h} user(s) were banned in the last 24 hours.`,
      count: bans24h,
    });
  }

  if (warnings.length === 0) {
    warnings.push({
      id: "all-clear",
      level: "info",
      title: "All clear",
      description: "No anomalies detected in the last 24 hours.",
    });
  }

  return {
    range: parsedRange,
    generatedAt: now.toISOString(),
    stats: {
      totalUsers,
      onlineUsers: onlineSessions.length,
      newUsers,
      bannedUsers,
      totalGroups,
      totalFollows,
      totalMessages,
      totalEvents,
    },
    activityByDay: fillDailySeries(activityByDayRaw, since, days),
    registrationsByDay: fillDailySeries(registrationsByDayRaw, since, days),
    eventsByAction: eventsByActionRaw
      .map((row) => ({ action: row.action, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    topActors,
    recentActivity,
    warnings,
  };
}
