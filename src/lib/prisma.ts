import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import { createDriverAdapter } from "./db/adapter";
import { resolveDatabaseConnection } from "./db/connection";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connection = resolveDatabaseConnection(process.env);
  return new PrismaClient({ adapter: createDriverAdapter(connection) });
}

function getPrismaClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/**
 * One client per Worker isolate, built on first query rather than on import:
 * `globalThis` survives across requests so the adapter and its warm
 * connections are reused, while the build — which imports this module without
 * ever running a query — never needs a reachable `DATABASE_URL`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
