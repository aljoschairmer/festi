import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/guards";
import { getGroupMessages } from "@/features/chat/actions/chat-action";
import { groupChatRevision } from "@/features/chat/lib/chatRevision";
import { streamOnChange } from "@/features/chat/lib/chatStream";
import { prisma } from "@/lib/prisma";
import { sseResponse } from "@/lib/sse";

/**
 * Group chat as a stream. Every `snapshot` carries the whole thread, so a
 * reconnecting client needs no patch replay.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/chat/group/[groupId]">,
) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const { groupId } = await ctx.params;

  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
    select: { status: true },
  });
  if (membership?.status !== "APPROVED") {
    return NextResponse.json(
      { error: "You must be a member to view messages." },
      { status: 403 },
    );
  }

  return sseResponse(request, (sender) =>
    streamOnChange({
      sender,
      revision: () => groupChatRevision(groupId),
      load: () => getGroupMessages(groupId),
    }),
  );
}
