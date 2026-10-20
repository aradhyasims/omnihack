// CV download for the candidate or authorized hiring staff: signed link + authorized session.
import type { NextRequest } from "next/server";
import { verifySignedPayload } from "@/server/crypto";
import { validateSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import { resumeForDownload } from "@/server/modules/talent/service";
import { storage } from "@/server/storage";
import { isAppError } from "@/server/errors";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!verifySignedPayload(`resume:${id}`, exp, sig)) return new Response("This link has expired. Reload the page to get a fresh link.", { status: 403 });
  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session || (session.user.mfaEnabledAt && !session.mfaVerified)) return new Response("Sign in required.", { status: 401 });
  try {
    const consent = await resumeForDownload(session.user, id);
    const store = storage();
    const fileName = consent.resumeName ?? "cv.pdf";
    if (store.presignedGetUrl) {
      const url = await store.presignedGetUrl(consent.resumeKey!, { fileName, contentType: "application/pdf", ttlSeconds: 60 });
      return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
    }
    const data = await store.get(consent.resumeKey!);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    if (isAppError(e)) return new Response(e.message, { status: e.status });
    throw e;
  }
}
