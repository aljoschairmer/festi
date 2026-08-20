import { describe, expect, it } from "vitest";
import { isNeonHost, resolveDatabaseConnection } from "./connection";

const NEON_POOLED =
  "postgresql://festi:pw@ep-cool-bird-123-pooler.eu-central-1.aws.neon.tech/festi?sslmode=require";
const NEON_DIRECT =
  "postgresql://festi:pw@ep-cool-bird-123.eu-central-1.aws.neon.tech/festi?sslmode=require";
const LOCAL = "postgresql://postgres:changeme@localhost:5432/database";

describe("isNeonHost", () => {
  it("matches Neon endpoints regardless of case", () => {
    expect(isNeonHost("ep-cool-bird-123.eu-central-1.aws.neon.tech")).toBe(
      true,
    );
    expect(isNeonHost("EP-Cool.EU-Central-1.AWS.NEON.TECH")).toBe(true);
  });

  it("does not match a host that merely mentions neon", () => {
    expect(isNeonHost("neon.example.com")).toBe(false);
    expect(isNeonHost("localhost")).toBe(false);
  });
});

describe("resolveDatabaseConnection", () => {
  it("picks the Neon driver for a Neon endpoint", () => {
    const connection = resolveDatabaseConnection({ DATABASE_URL: NEON_POOLED });

    expect(connection.driver).toBe("neon");
    expect(connection.pooled).toBe(true);
    expect(connection.url).toBe(NEON_POOLED);
  });

  it("flags a direct Neon endpoint as unpooled", () => {
    expect(
      resolveDatabaseConnection({ DATABASE_URL: NEON_DIRECT }),
    ).toMatchObject({ driver: "neon", pooled: false });
  });

  it("falls back to plain Postgres for a local database", () => {
    expect(resolveDatabaseConnection({ DATABASE_URL: LOCAL })).toMatchObject({
      driver: "postgres",
      host: "localhost",
      pooled: false,
    });
  });

  it("treats a pgbouncer parameter as pooled", () => {
    const connection = resolveDatabaseConnection({
      DATABASE_URL: `${LOCAL}?pgbouncer=true`,
    });

    expect(connection.pooled).toBe(true);
  });

  it("honours an explicit driver override in both directions", () => {
    expect(
      resolveDatabaseConnection({
        DATABASE_URL: LOCAL,
        DATABASE_DRIVER: "neon",
      }).driver,
    ).toBe("neon");

    expect(
      resolveDatabaseConnection({
        DATABASE_URL: NEON_POOLED,
        DATABASE_DRIVER: "postgres",
      }).driver,
    ).toBe("postgres");
  });

  it("rejects an unknown driver override", () => {
    expect(() =>
      resolveDatabaseConnection({
        DATABASE_URL: LOCAL,
        DATABASE_DRIVER: "hyperdrive",
      }),
    ).toThrow(/DATABASE_DRIVER/);
  });

  it("rejects a missing, blank, non-Postgres or malformed URL", () => {
    expect(() => resolveDatabaseConnection({})).toThrow(
      /DATABASE_URL is not set/,
    );
    expect(() => resolveDatabaseConnection({ DATABASE_URL: "   " })).toThrow(
      /DATABASE_URL is not set/,
    );
    expect(() =>
      resolveDatabaseConnection({ DATABASE_URL: "mysql://root@localhost/db" }),
    ).toThrow(/postgresql:\/\/ scheme/);
    expect(() =>
      resolveDatabaseConnection({ DATABASE_URL: "not a url" }),
    ).toThrow(/valid connection URL/);
  });

  it("keeps a password with an unescaped @ out of the host", () => {
    const connection = resolveDatabaseConnection({
      DATABASE_URL: "postgresql://festi:p@ss@localhost:5432/database",
    });

    expect(connection.host).toBe("localhost");
  });
});
