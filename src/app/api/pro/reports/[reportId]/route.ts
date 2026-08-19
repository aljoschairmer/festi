import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/guards";
import { createLiveTissotClient } from "@/features/pro/lib/clients";

/** Tissot report ids are opaque tokens; reject anything path-traversal-ish. */
const REPORT_ID_PATTERN = /^[\w.-]{1,128}$/;

/** File extension for the download filename, derived from the content type. */
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

/**
 * Authenticated proxy for official Tissot reports, so the browser never talks
 * to prod.server.tissottiming.com directly. Not every report is a PDF (the
 * "Photofinish" report is a JPG/PNG image), so we serve the content type the
 * client resolved (response header, else magic-byte sniffing) rather than
 * assuming application/pdf. The uncached client is used because Next's fetch
 * cache is not meant for multi-MB binary payloads.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/pro/reports/[reportId]">,
) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const { reportId } = await ctx.params;
  if (!REPORT_ID_PATTERN.test(reportId)) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  }

  try {
    const file = await createLiveTissotClient().getFile(reportId);
    const ext = EXT_BY_CONTENT_TYPE[file.contentType] ?? "bin";
    return new Response(file.bytes, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${reportId}.${ext}"`,

        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The report could not be fetched." },
      { status: 502 },
    );
  }
}
