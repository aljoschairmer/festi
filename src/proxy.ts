import { type NextRequest, NextResponse } from "next/server";

/**
 * Optimistic auth gate for the dashboard.
 *
 * The real authorization check stays in `dashboard/layout.tsx` (`requireAuth`)
 * and in each server action — Next's own guidance is explicit that proxy
 * "should not be used as a full session management or authorization
 * solution", only for optimistic checks
 * (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:29`).
 *
 * What it buys us: a layout only re-renders when its segment does, so a
 * client-side navigation into the dashboard after the session expired could
 * render the shell before any guard ran. Redirecting here on a missing
 * session cookie closes that window and saves a round trip.
 *
 * Note it checks for the *presence* of the cookie only. It never validates
 * it — that would need the database, which does not belong in the proxy.
 */
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some(
    (name) => request.cookies.get(name)?.value,
  );

  if (!hasSession) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
