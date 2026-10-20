import type { NextRequest } from "next/server";
import { validateSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import { getCertificateForDownload } from "@/server/modules/certificates/service";
import { renderCertificatePdf } from "@/server/modules/certificates/pdf";
import { isAppError } from "@/server/errors";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session || (session.user.mfaEnabledAt && !session.mfaVerified)) return new Response("Sign in required.", { status: 401 });
  try {
    const cert = await getCertificateForDownload(session.user, code.toUpperCase());
    const pdf = await renderCertificatePdf({
      code: cert.code,
      recipientName: cert.recipientName,
      category: cert.category,
      distinction: cert.distinction.split("#replaced-")[0],
      competitionTitle: cert.competition.title,
      organizerName: cert.competition.organization.name,
      issuedAt: cert.issuedAt,
      revoked: Boolean(cert.revokedAt),
      template: cert.competition.certificateTemplate,
      appUrl: process.env.APP_URL ?? req.nextUrl.origin,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="OmniHack-certificate-${cert.code}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (isAppError(e)) return new Response(e.message, { status: e.status });
    throw e;
  }
}
