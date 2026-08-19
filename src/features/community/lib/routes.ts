/**
 * Community URLs in one place, because `revalidatePath` accepts any string
 * and reports nothing when the path has no cache entry, so a typo is silent.
 */
export const COMMUNITY_PATH = "/dashboard/community";

export function groupPath(groupId: string): string {
  return `${COMMUNITY_PATH}/g/${groupId}`;
}

/** For `revalidatePath`, not `<Link>`: a wrong href fails loudly on its own. */
export function riderPath(userId: string): string {
  return `${COMMUNITY_PATH}/u/${userId}`;
}
