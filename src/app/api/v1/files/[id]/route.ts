// Private file download: requires BOTH a valid short-lived signature and an authorized session.
import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { verifySignedPayload } from "@/server/crypto";
import { validateSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import { canViewProject, downloadBlockReason } from "@/server/modules/submissions/service";
import { storage } from "@/server/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!verifySignedPayload(`file:${id}`, exp, sig))
    return new Response("This download link has expired. Reload the page to get a fresh link.", { status: 403 });
  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session || (session.user.mfaEnabledAt && !session.mfaVerified)) return new Response("Sign in required.", { status: 401 });
  const att = await db.attachment.findUnique({ where: { id }, include: { submission: { select: { projectId: true } } } });
  if (!att || att.deletedAt) return new Response("Not found.", { status: 404 });
  if (!(await canViewProject(session.user, att.submission.projectId))) return new Response("Forbidden.", { status: 403 });
  const blocked = downloadBlockReason(att);
  if (blocked) return new Response(blocked.message, { status: blocked.status });
  const store = storage();
  if (store.presignedGetUrl) {
    // S3: authorization already passed — hand out a 60-second direct link instead of proxying bytes.
    const url = await store.presignedGetUrl(att.storageKey, { fileName: att.fileName, contentType: att.mimeType, ttlSeconds: 60 });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
  }
  const data = await store.get(att.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename="${att.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
