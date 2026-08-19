import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/guards";
import { getDirectMessages } from "@/features/chat/actions/direct-chat-action";
import { directChatRevision } from "@/features/chat/lib/chatRevision";
import { streamOnChange } from "@/features/chat/lib/chatStream";
import { sseResponse } from "@/lib/sse";

/**
 * A direct-message thread as a stream. `getDirectMessages` marks the
 * partner's messages read as a side effect, so that write now happens when a
 * message arrives rather than on a timer.
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
