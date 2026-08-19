import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One pool and one client per Worker isolate: `globalThis` survives across
 * requests, so warm connections are reused. `maxLifetimeSeconds`,
 * `idleTimeoutMillis` and `maxUses` bound how long, so a socket the runtime
 * reaped is discarded rather than reused.
 */
const globalForPrisma = globalThis as unknown as {
  prismaPool: Pool | undefined;
  prisma: PrismaClient | undefined;
};

const pool =
  globalForPrisma.prismaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,

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
