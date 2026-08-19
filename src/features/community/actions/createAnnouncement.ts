"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { canManageGroup } from "../lib/groupRoles";
import { groupPath } from "../lib/routes";
import { createAnnouncementSchema } from "../schemas/announcements";

type Result =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Posts an announcement to a group. Owners and moderators only; every other
 * approved member is notified.
 */
export async function createAnnouncement(input: {
  groupId: string;
  content: string;
}): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid announcement.",
    };
  }

  const { groupId, content } = parsed.data;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true },
  });

  if (!group) {
    return { success: false, error: "Group not found." };
  }

  if (!(await canManageGroup(groupId, session.user.id))) {
    return {
      success: false,
      error: "Only the group owner and moderators can post announcements.",
    };
  }

  await prisma.groupAnnouncement.create({
    data: { groupId, authorId: session.user.id, content },
  });

  revalidatePath(groupPath(groupId));

  await Logger.log(
    ActivityAction.GROUP_ANNOUNCEMENT_CREATED,
    `${session.user.email} posted an announcement in "${group.name}".`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
    },
  );

  const members = await prisma.groupMember.findMany({
    where: { groupId, status: "APPROVED", NOT: { userId: session.user.id } },
    select: { userId: true },
  });

  await Promise.all(
    members.map((member) =>
      Notifier.push({
        type: NotificationType.GROUP_ANNOUNCEMENT,
        userId: member.userId,
        actorId: session.user.id,
        targetType: "Group",
        targetId: groupId,
        message: group.name,
      }),
    ),
  );

  return { success: true, message: "Announcement posted." };
}
