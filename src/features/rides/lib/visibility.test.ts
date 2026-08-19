import { describe, expect, it, vi } from "vitest";

// `visibility.ts` imports the Prisma client at module scope, so the mock has
// to be registered before the import is resolved.
const findFirst = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    groupMember: {
      get findFirst() {
        return findFirst;
      },
      get findMany() {
        return findMany;
      },
    },
  },
}));

const { rideVisibilityFilter, canViewRide, approvedGroupIds } = await import(
  "./visibility"
);

/**
 * These guard the fix for A-02: rides posted to a group used to appear in
 * every signed-in user's list and were joinable by anyone.
 */
describe("rideVisibilityFilter", () => {
  it("always allows rides without a group", () => {
    const where = rideVisibilityFilter("user-1", []);
    expect(where.OR).toContainEqual({ groupId: null });
  });

  it("always allows the user's own rides", () => {
    const where = rideVisibilityFilter("user-1", []);
    expect(where.OR).toContainEqual({ creatorId: "user-1" });
  });

  it("allows group rides only for the groups the user belongs to", () => {
    const where = rideVisibilityFilter("user-1", ["group-a", "group-b"]);
    expect(where.OR).toContainEqual({
      groupId: { in: ["group-a", "group-b"] },
    });
  });

  it("omits the group clause entirely without memberships", () => {
    // An empty `in: []` would be harmless but pointless; more importantly it
    // must never widen to "any group".
    const where = rideVisibilityFilter("user-1", []);
    const clauses = JSON.stringify(where.OR);
    expect(clauses).not.toContain('groupId":{"in');
    expect(where.OR).toHaveLength(2);
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

describe("approvedGroupIds", () => {
  it("asks only for approved memberships of that user", async () => {
    findMany.mockResolvedValueOnce([
      { groupId: "group-a" },
      { groupId: "group-b" },
    ]);
    const ids = await approvedGroupIds("user-1");
    expect(ids).toEqual(["group-a", "group-b"]);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "APPROVED" },
      }),
    );
  });
});
