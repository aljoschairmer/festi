import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/guards";
import { getGroupMessages } from "@/features/chat/actions/chat-action";
import { groupChatRevision } from "@/features/chat/lib/chatRevision";
import { streamOnChange } from "@/features/chat/lib/chatStream";
import { prisma } from "@/lib/prisma";
import { sseResponse } from "@/lib/sse";

/**
 * Group chat as a stream, replacing the panel's 2s server-action polling
 * (C-02): 30 requests a minute per open thread became one connection.
 *
 * Every `snapshot` event carries the whole thread, exactly what
 * `getGroupMessages` returned to the poll, so the client needs no patch
 * replay — a dropped connection is repaired by the first event after
 * `EventSource` reconnects.
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

  // Membership is checked here so a non-member gets an honest 403 instead of
  // an event stream that opens and then dies. It is also re-checked inside
  // `getGroupMessages` on every push, which is what closes the stream when
  // someone is removed from the group while their tab is open.
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
