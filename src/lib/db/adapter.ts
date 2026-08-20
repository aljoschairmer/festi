import "server-only";

import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import type { DatabaseConnection } from "./connection";

/**
 * Ceiling on sockets held per isolate. Under Neon only interactive
 * transactions take one — plain queries travel over HTTP — so this bounds
 * concurrent transactions, not concurrent queries.
 */
const MAX_SOCKETS = 5;

/** Turns a hanging connect into a query error instead of a stalled request. */
const CONNECT_TIMEOUT_MS = 5_000;

const IDLE_TIMEOUT_MS = 10_000;

/**
 * A socket the runtime reaped between requests looks healthy to the pool, so
 * connections are retired on age and use count rather than trusted forever.
 */
const MAX_SOCKET_LIFETIME_SEC = 60;
const MAX_SOCKET_USES = 100;

const POOL_CONFIG = {
  max: MAX_SOCKETS,
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  maxLifetimeSeconds: MAX_SOCKET_LIFETIME_SEC,
  maxUses: MAX_SOCKET_USES,
};

/**
 * Queries travel as a single HTTPS request rather than over a WebSocket, so no
 * handshake sits in front of them; transactions still take a socket and open
 * one themselves. Neon drops back to the socket for everything once a pool
 * carries a listener other than `error`, which is the only one installed here.
 */
function createNeonAdapter(connection: DatabaseConnection): PrismaNeon {
  neonConfig.poolQueryViaFetch = true;

  if (!connection.pooled) {
    console.warn(
      `Neon endpoint ${connection.host} is not pooled. Every isolate opens ` +
        "its own connections against a compute that caps them; use the " +
        "-pooler endpoint for DATABASE_URL and keep the direct one in " +
        "DIRECT_URL for migrations.",
    );
  }

  return new PrismaNeon(
    { connectionString: connection.url, ...POOL_CONFIG },
    {
      onPoolError: (error) => console.error("Neon pool error", error),
      onConnectionError: (error) =>
        console.error("Neon connection error", error),
    },
  );
}

/**
 * Builds the driver adapter that matches the connection. Neon is reached over
 * its serverless protocol; anything else — a local Docker database, a CI
 * service container — over plain TCP.
 */
export function createDriverAdapter(
  connection: DatabaseConnection,
): PrismaNeon | PrismaPg {
  if (connection.driver === "neon") return createNeonAdapter(connection);

  return new PrismaPg({ connectionString: connection.url, ...POOL_CONFIG });
}
