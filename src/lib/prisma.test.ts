import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const clientConstructor = vi.fn();
const findMany = vi.fn();

class FakePrismaClient {
  user = { findMany };
  constructor(options: unknown) {
    clientConstructor(options);
  }
  $transaction() {
    return Promise.resolve();
  }
}

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: FakePrismaClient,
}));

const createDriverAdapter = vi.fn(() => ({ adapterName: "fake" }));
vi.mock("./db/adapter", () => ({
  get createDriverAdapter() {
    return createDriverAdapter;
  },
}));

/**
 * Guards the lazy singleton: importing the module must not build a client,
 * because on Workers `process.env` is only populated once a request is in
 * flight and the build imports this module without ever querying.
 */
describe("prisma", () => {
  const originalUrl = process.env.DATABASE_URL;

  afterAll(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  beforeEach(() => {
    clientConstructor.mockClear();
    createDriverAdapter.mockClear();
    findMany.mockReset();
    (globalThis as { prisma?: unknown }).prisma = undefined;
  });

  it("does not build a client on import", async () => {
    process.env.DATABASE_URL = "postgresql://festi:pw@localhost:5432/festi";
    await import("./prisma");

    expect(clientConstructor).not.toHaveBeenCalled();
  });

  it("builds one client on first use and reuses it", async () => {
    process.env.DATABASE_URL = "postgresql://festi:pw@localhost:5432/festi";
    const { prisma } = await import("./prisma");

    findMany.mockResolvedValue([]);
    await prisma.user.findMany();
    await prisma.user.findMany();

    expect(clientConstructor).toHaveBeenCalledTimes(1);
    expect(createDriverAdapter).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("exposes client methods as callable functions", async () => {
    process.env.DATABASE_URL = "postgresql://festi:pw@localhost:5432/festi";
    const { prisma } = await import("./prisma");

    expect(typeof prisma.$transaction).toBe("function");
  });

  it("surfaces a missing DATABASE_URL on first use", async () => {
    process.env.DATABASE_URL = "";
    const { prisma } = await import("./prisma");

    expect(() => prisma.user.findMany()).toThrow(/DATABASE_URL is not set/);
  });
});
