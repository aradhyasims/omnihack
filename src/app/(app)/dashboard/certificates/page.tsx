import type { Metadata } from "next";
import Link from "next/link";
import { Badge, DemoBadge, EmptyState, Icon, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { CERT_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const user = await requireUser("/dashboard/certificates");
  const certs = await db.certificate.findMany({
    where: { userId: user.id },
    include: { competition: { select: { title: true, slug: true, isDemo: true, organization: { select: { name: true } } } } },
    orderBy: { issuedAt: "desc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Certificates" description="Download your certificates as PDF. Anyone can verify them with the certificate ID or QR code." />
      {certs.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {certs.map((c) => (
            <article key={c.id} className={`card relative overflow-hidden p-6 ${c.revokedAt ? "opacity-70" : ""}`}>
              <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-brand-100" aria-hidden />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={c.category === "WINNER" ? "warning" : "brand"}>
                    <Icon name={c.category === "WINNER" ? "trophy" : "certificate"} className="h-3.5 w-3.5" />
                    {CERT_LABEL[c.category]}
                    {c.distinction && !c.distinction.includes("#") ? ` · ${c.distinction}` : ""}
                  </Badge>
                  {c.revokedAt ? <Badge tone="danger">Revoked</Badge> : null}
                  {c.competition.isDemo ? <DemoBadge /> : null}
                </div>
                <h2 className="mt-3 text-lg font-bold">{c.competition.title}</h2>
                <p className="text-sm text-ink-500">
                  {c.competition.organization.name} · Issued {formatDate(c.issuedAt)}
                </p>
                <p className="mt-3 font-mono text-sm font-semibold tracking-wider">{c.code}</p>
                <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                  {!c.revokedAt ? (
                    <a href={`/api/v1/certificates/${c.code}/pdf`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      <Icon name="file" className="h-4 w-4" /> Download PDF
                    </a>
                  ) : null}
                  <Link href={`/verify/${c.code}`} className="inline-flex items-center gap-1 text-ink-600 hover:underline">
                    <Icon name="shield" className="h-4 w-4" /> Verification page
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No certificates yet"
          description="Certificates appear here once an organizer issues them after an event."
          icon={<Icon name="certificate" />}
        />
      )}
    </div>
  );
}
