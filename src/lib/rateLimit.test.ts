import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    get $queryRaw() {
      return queryRaw;
    },
    rateLimit: {
      get deleteMany() {
        return deleteMany;
      },
    },
  },
}));
const getClientIp = vi.fn();
vi.mock("@/lib/clientIp", () => ({
  get getClientIp() {
    return getClientIp;
  },
}));

const { consumeRateLimit, limitByIp } = await import("./rateLimit");

/**
 * Guards A-04: `registerUser` calls `auth.api.signUpEmail` directly, which
 * bypasses better-auth's own limiter, leaving an unauthenticated path that
 * sends mail through Resend with no cap at all.
 */
describe("consumeRateLimit", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    getClientIp.mockReset();
    deleteMany.mockReset();
  });

  const window = { limit: 3, windowSec: 900 };
  const future = () => new Date(Date.now() + 900_000);

  it("allows a call inside the limit", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 1, expiresAt: future() }]);
    await expect(consumeRateLimit("k", window)).resolves.toEqual({
      allowed: true,
      retryAfterSec: 0,
    });
  });

  it("still allows the call that exactly reaches the limit", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 3, expiresAt: future() }]);
    const r = await consumeRateLimit("k", window);
    expect(r.allowed).toBe(true);
  });

  it("blocks the first call past the limit", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 4, expiresAt: future() }]);
    const r = await consumeRateLimit("k", window);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("reports how long the caller has to wait", async () => {
    queryRaw.mockResolvedValueOnce([
      { count: 9, expiresAt: new Date(Date.now() + 120_000) },
    ]);
    const r = await consumeRateLimit("k", window);
    expect(r.retryAfterSec).toBeGreaterThan(110);
    expect(r.retryAfterSec).toBeLessThanOrEqual(120);
  });

  it("never reports a retry of zero seconds while blocked", async () => {
    // A window that has just expired must not produce "retry in 0s".
    queryRaw.mockResolvedValueOnce([
      { count: 99, expiresAt: new Date(Date.now() - 5_000) },
    ]);
    const r = await consumeRateLimit("k", window);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("fails open when the limiter itself is broken", async () => {
    // A limiter that is down must not take registration down with it.
    queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    await expect(consumeRateLimit("k", window)).resolves.toEqual({
      allowed: true,
      retryAfterSec: 0,
    });
  });

  it("answers the same whether or not housekeeping blows up", async () => {
    // Pruning runs on a random fraction of calls. It must not be able to
    // change the verdict — the whole limiter used to sit in one try block,
    // so a synchronous throw from the prune path failed the call open.
    deleteMany.mockImplementation(() => {
      throw new Error("relation does not exist");
    });
    queryRaw.mockResolvedValue([{ count: 9, expiresAt: future() }]);
    const results = await Promise.all(
      Array.from({ length: 200 }, () => consumeRateLimit("k", window)),
    );
    expect(results.every((r) => r.allowed === false)).toBe(true);
    deleteMany.mockReset();
  });

  it("fails open when the upsert returns nothing", async () => {
    queryRaw.mockResolvedValueOnce([]);
    const r = await consumeRateLimit("k", window);
    expect(r.allowed).toBe(true);
  });
});

describe("limitByIp", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    getClientIp.mockReset();
  });

  it("scopes the bucket by scope and address", async () => {
    getClientIp.mockResolvedValueOnce("203.0.113.7");
    queryRaw.mockResolvedValueOnce([{ count: 1, expiresAt: new Date() }]);
    await limitByIp("register", { limit: 5, windowSec: 60 });
    // The key is interpolated into the tagged template as a parameter.
    expect(queryRaw.mock.calls[0]).toContain("register:203.0.113.7");
  });

  it("falls back to a shared bucket when the address is unknown", async () => {
    getClientIp.mockResolvedValueOnce(null);
    queryRaw.mockResolvedValueOnce([{ count: 1, expiresAt: new Date() }]);
    await limitByIp("register", { limit: 5, windowSec: 60 });
    // Stricter, not laxer — the right direction when we cannot tell callers apart.
    expect(queryRaw.mock.calls[0]).toContain("register:unknown");
  });
});
