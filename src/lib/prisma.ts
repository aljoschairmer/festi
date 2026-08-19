import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One pg pool + one PrismaClient per Cloudflare Worker isolate
 * (`globalForPrisma` pattern).
 *
 * Why this is workerd-compatible:
 * - A Worker isolate is a long-lived V8 sandbox whose `globalThis` survives
 *   across requests, so caching the pool on `globalThis` reuses warm TCP/TLS
 *   connections instead of paying a fresh handshake on every request.
 * - `pg` automatically speaks `cloudflare:sockets` via `pg-cloudflare` when
 *   the bundle is resolved with the `workerd` condition, so no Node `net`/`tls`
 *   APIs are required.
 * - Sockets opened in a previous request may have been reaped by the runtime.
 *   `maxLifetimeSeconds` + `idleTimeoutMillis` + `maxUses` bound how long a
 *   connection can be reused before pg-pool discards it, and pg evicts clients
 *   whose socket errors, so stale connections are dropped instead of reused
 *   forever.
 * - `connectionTimeoutMillis` turns a hanging TCP connect into a regular query
 *   error (surfaced to the UI, which can retry) instead of blocking the server
 *   action until the Worker's wall-clock limit kills it.
 */
const globalForPrisma = globalThis as unknown as {
  prismaPool: Pool | undefined;
  prisma: PrismaClient | undefined;
};

const pool =
  globalForPrisma.prismaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Small pool: isolates are per-colo/per-instance and Postgres connection
    // limits are shared across all of them.
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
    maxLifetimeSeconds: 60,
    maxUses: 100,
  });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

globalForPrisma.prismaPool = pool;
globalForPrisma.prisma = prisma;
