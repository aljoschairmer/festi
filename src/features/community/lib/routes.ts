/**
 * The community URLs, in one place.
 *
 * Seven actions used to call `revalidatePath("/groups/…")` — a segment that
 * has never existed in this app; the real route is
 * `/dashboard/community/g/[id]`. Because `revalidatePath` accepts any string
 * and reports nothing for a path with no cache entry, the mistake was
 * invisible: joining, leaving, kicking or renaming simply left a stale page
 * until the next full navigation. Building the paths here means a wrong one
 * cannot be typed at a call site.
 */
export const COMMUNITY_PATH = "/dashboard/community";

/** The page for a single group. */
export function groupPath(groupId: string): string {
  return `${COMMUNITY_PATH}/g/${groupId}`;
}

/**
 * The public profile of a single rider.
 *
 * Used for `revalidatePath`, not for `<Link>`s: a wrong `href` shows a 404 the
 * first time anyone clicks it, while a wrong `revalidatePath` says nothing at
 * all. The silent one is what needs the guard.
 */
export function riderPath(userId: string): string {
  return `${COMMUNITY_PATH}/u/${userId}`;
}
