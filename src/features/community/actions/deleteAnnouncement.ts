"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { canManageGroup } from "../lib/groupRoles";
import { groupPath } from "../lib/routes";

type Result =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Deletes an announcement. Allowed for its author, the group owner, and
 * moderators.
 */
export async function deleteAnnouncement(
  announcementId: string,
): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const announcement = await prisma.groupAnnouncement.findUnique({
    where: { id: announcementId },
    select: { groupId: true, authorId: true },
  });

  if (!announcement) {
    return { success: false, error: "Announcement not found." };
  }

  const isAuthor = announcement.authorId === session.user.id;
  if (
    !isAuthor &&
    !(await canManageGroup(announcement.groupId, session.user.id))
  ) {
    return {
      success: false,
      error: "Only the author, owner, or moderators can delete announcements.",
    };
  }

  await prisma.groupAnnouncement.delete({ where: { id: announcementId } });

  revalidatePath(groupPath(announcement.groupId));

  return { success: true, message: "Announcement deleted." };
}
