import "server-only";

/**
 * Transport used to reach Postgres. `neon` speaks Neon's serverless protocol
 * (HTTP for queries, WebSocket for transactions); `postgres` is a plain TCP
 * connection, which is what a local Docker database or CI service needs.
 */
export type DatabaseDriver = "neon" | "postgres";

export type DatabaseConnection = {
  driver: DatabaseDriver;
  url: string;
  host: string;
  /** True when the URL addresses a pooler rather than a compute directly. */
  pooled: boolean;
};

export type DatabaseEnvironment = Record<string, string | undefined> & {
  DATABASE_URL?: string;
  DATABASE_DRIVER?: string;
};

const NEON_HOST_SUFFIXES = [".neon.tech", ".neon.build"];
const POSTGRES_PROTOCOLS = ["postgres:", "postgresql:"];
const POOLER_HOST_MARKER = "-pooler.";

export function isNeonHost(host: string): boolean {
  const lower = host.toLowerCase();
  return NEON_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function parseDriverOverride(value: string | undefined): DatabaseDriver | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "neon" || normalized === "postgres") return normalized;
  throw new Error(
    `DATABASE_DRIVER must be "neon" or "postgres", got "${value}".`,
  );
}

function parseUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid connection URL. Expected " +
        "postgresql://user:password@host/database.",
    );
  }
  if (!POSTGRES_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error(
      `DATABASE_URL must use the postgresql:// scheme, got "${parsed.protocol}//".`,
    );
  }
  if (!parsed.hostname) {
    throw new Error("DATABASE_URL is missing a host.");
  }
  return parsed;
}

/**
 * Classifies `DATABASE_URL` into the driver that can actually talk to it.
 * Set `DATABASE_DRIVER` to override the host-based guess — needed for a Neon
 * proxy running under a non-Neon hostname.
 *
 * Throws rather than guessing: a mis-detected driver fails later, deeper, and
 * with a worse message.
 */
export function resolveDatabaseConnection(
  env: DatabaseEnvironment,
): DatabaseConnection {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Point it at your Neon pooled endpoint " +
        "(…-pooler.<region>.aws.neon.tech) or at a local Postgres.",
    );
  }

  const parsed = parseUrl(url);
  const override = parseDriverOverride(env.DATABASE_DRIVER);

  return {
    driver: override ?? (isNeonHost(parsed.hostname) ? "neon" : "postgres"),
    url,
    host: parsed.hostname,
    pooled:
      parsed.hostname.toLowerCase().includes(POOLER_HOST_MARKER) ||
      parsed.searchParams.get("pgbouncer") === "true",
  };
}
