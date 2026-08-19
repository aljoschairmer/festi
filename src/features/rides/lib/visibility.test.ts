import { describe, expect, it, vi } from "vitest";

// `visibility.ts` imports the Prisma client at module scope, so the mock has
// to be registered before the import is resolved.
const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    groupMember: {
      get findFirst() {
        return findFirst;
      },
    },
  },
}));

const { rideVisibilityFilter, canViewRide } = await import("./visibility");

/**
 * These guard the fix for A-02 / SEC-11: rides posted to a group used to
 * appear in every signed-in user's list and were joinable by anyone.
 */
describe("rideVisibilityFilter", () => {
  it("always allows rides without a group", () => {
    expect(rideVisibilityFilter("user-1").OR).toContainEqual({ groupId: null });
  });

  it("always allows the user's own rides", () => {
    expect(rideVisibilityFilter("user-1").OR).toContainEqual({
      creatorId: "user-1",
    });
  });

  it("allows group rides only through an approved membership of that user", () => {
    expect(rideVisibilityFilter("user-1").OR).toContainEqual({
      group: { members: { some: { userId: "user-1", status: "APPROVED" } } },
    });
  });

  it("offers exactly three ways in, and no unconditional one", () => {
    // The clause is the whole boundary: any extra branch is a way to see a
    // ride, so a new one has to be a deliberate change, not a silent one.
    const where = rideVisibilityFilter("user-1");
    expect(where.OR).toHaveLength(3);
    expect(JSON.stringify(where.OR)).toContain('"status":"APPROVED"');
  });

  it("never matches a group ride on membership alone, ignoring status", () => {
    // A `some: { userId }` without the status would let a pending join
    // request read the group's rides.
    const serialised = JSON.stringify(rideVisibilityFilter("user-1").OR);
    expect(serialised).not.toContain('{"userId":"user-1"}}');
  });
});

describe("canViewRide", () => {
  it("lets anyone see an ungrouped ride", async () => {
    findFirst.mockClear();
    const ok = await canViewRide("user-1", {
      groupId: null,
      creatorId: "someone-else",
    });
    expect(ok).toBe(true);
    // No membership lookup needed.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("lets the creator see their own group ride", async () => {
    findFirst.mockClear();
    const ok = await canViewRide("user-1", {
      groupId: "group-a",
      creatorId: "user-1",
    });
    expect(ok).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("allows an approved member of the group", async () => {
    findFirst.mockResolvedValueOnce({ id: "member-1" });
    const ok = await canViewRide("user-2", {
      groupId: "group-a",
      creatorId: "user-1",
    });
    expect(ok).toBe(true);
  });

  it("refuses a non-member — the actual leak", async () => {
    findFirst.mockResolvedValueOnce(null);
    const ok = await canViewRide("outsider", {
      groupId: "group-a",
      creatorId: "user-1",
    });
    expect(ok).toBe(false);
  });

  it("only counts APPROVED memberships, not pending requests", async () => {
    findFirst.mockResolvedValueOnce(null);
    await canViewRide("pending-user", {
      groupId: "group-a",
      creatorId: "user-1",
    });
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "APPROVED" }),
      }),
    );
  });
});
