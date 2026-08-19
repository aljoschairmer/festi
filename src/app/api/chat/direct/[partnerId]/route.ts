import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/guards";
import { getDirectMessages } from "@/features/chat/actions/direct-chat-action";
import { directChatRevision } from "@/features/chat/lib/chatRevision";
import { streamOnChange } from "@/features/chat/lib/chatStream";
import { sseResponse } from "@/lib/sse";

/**
 * A direct-message thread as a stream, replacing its 2s polling (C-02).
 *
 * `getDirectMessages` marks the partner's messages as read as a side effect,
 * which used to run 30 times a minute per open thread. Here it only runs when
 * the revision moved, so the write happens when a message actually arrives
 * rather than on a timer.
 *
 * `canMessage` (mutual follow) is read with each snapshot rather than being
 * part of the revision token. Unfollowing mid-conversation is rare enough to
 * settle on the next message or reconnect, and probing the follow graph every
 * two seconds to catch it would cost more than it is worth.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/chat/direct/[partnerId]">,
) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const { partnerId } = await ctx.params;
  const myId = session.user.id;

  return sseResponse(request, (sender) =>
    streamOnChange({
      sender,
      revision: () => directChatRevision(myId, partnerId),
      load: () => getDirectMessages(partnerId),
    }),
  );
}
