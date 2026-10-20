import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Icon } from "@/components/ui/primitives";
import { verifyCertificate } from "@/server/modules/certificates/service";
import { rateLimit } from "@/server/rate-limit";
import { isAppError } from "@/server/errors";
import { CERT_LABEL, TYPE_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Certificate verification", robots: { index: false } };

export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  let result: Awaited<ReturnType<typeof verifyCertificate>> = null;
  let limited = false;
  try {
    rateLimit(`verify:${ip}`, 30, 60_000);
    result = await verifyCertificate(decodeURIComponent(code));
  } catch (e) {
    if (isAppError(e) && e.code === "RATE_LIMITED") limited = true;
    else throw e;
  }
  const valid = result?.valid;
  return (
    <div className="container-page max-w-2xl py-16">
      <div className={`card overflow-hidden ${valid ? "ring-2 ring-emerald-500/30" : ""}`}>
        <div className={`flex items-center gap-4 px-6 py-5 ${valid ? "bg-emerald-50" : result ? "bg-rose-50" : "bg-ink-50"}`}>
          <span
            className={`grid h-12 w-12 place-items-center rounded-full ${valid ? "bg-emerald-600 text-white" : result ? "bg-rose-600 text-white" : "bg-ink-300 text-white"}`}
          >
            <Icon name={valid ? "check" : "close"} />
          </span>
          <div>
            <h1 className="text-xl font-extrabold">
              {limited ? "Too many lookups" : valid ? "Valid certificate" : result ? "Certificate revoked" : "Certificate not found"}
            </h1>
            <p className="font-mono text-sm text-ink-600">{decodeURIComponent(code).toUpperCase()}</p>
          </div>
        </div>
        {result ? (
          <dl className="divide-y divide-ink-100 text-sm">
            {[
              ["Recipient", result.recipientName],
              ["Certificate", `${CERT_LABEL[result.category]}${result.distinction ? ` — ${result.distinction}` : ""}`],
              ["Competition", result.competition.title],
              ["Type", TYPE_LABEL[result.competition.type]],
              ["Organizer", result.competition.organizer],
              ["Issued", formatDate(result.issuedAt)],
              ...(result.revokedAt ? [["Revoked", formatDate(result.revokedAt)]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-6 py-3">
                <dt className="text-ink-500">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="px-6 py-5 text-sm text-ink-600">
            {limited ? "Please wait a minute and try again." : "No OmniHack certificate matches this ID. Check for typos — IDs look like OH-XXXX-XXXX-XXXX."}
          </p>
        )}
      </div>
      <div className="mt-6 flex gap-4 text-sm font-semibold">
        <Link href="/verify" className="text-brand-600 hover:underline">
          Verify another
        </Link>
        {result?.competition.slug ? (
          <Link href={`/competitions/${result.competition.slug}`} className="text-brand-600 hover:underline">
            Competition page
          </Link>
        ) : null}
      </div>
      <p className="mt-6 text-xs text-ink-400">Verification shows only the information printed on the certificate.</p>
    </div>
  );
}
