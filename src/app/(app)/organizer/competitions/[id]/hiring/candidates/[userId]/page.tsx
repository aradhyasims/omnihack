import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { SubmissionView } from "@/components/workspace/submission-view";
import { OPENING_TYPE_LABEL } from "@/components/talent/opening-card";
import { candidateProfile } from "@/server/modules/talent/service";
import { APPLICATION_STATUS_META, CERT_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { loadManaged } from "../../../load";

export default async function CandidatePage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const { user, can } = await loadManaged(id);
  if (!can("talent.view")) redirect(`/organizer/competitions/${id}`);
  const p = await candidateProfile(user, id, userId).catch(() => null);
  if (!p) {
    return (
      <div className="space-y-4">
        <BackLink id={id} />
        <Alert tone="info">This candidate is not in the talent pool (they may have withdrawn consent).</Alert>
      </div>
    );
  }
  const u = p.user;
  return (
    <div className="space-y-6">
      <BackLink id={id} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={u.name} description={u.headline ?? undefined} />
            <dl className="space-y-2 p-5 text-sm">
              {u.institution ? <Row k="Institution" v={u.institution} /> : null}
              {p.consent.graduationYear ? <Row k="Graduation" v={String(p.consent.graduationYear)} /> : null}
              {u.country ? <Row k="Country" v={u.country} /> : null}
              <Row k="Looking for" v={p.consent.roleInterests.map((t) => OPENING_TYPE_LABEL[t]).join(", ")} />
              {p.consent.preferredLocations.length ? <Row k="Locations" v={p.consent.preferredLocations.join(", ")} /> : null}
              {p.consent.availableFrom ? <Row k="Available from" v={formatDate(p.consent.availableFrom)} /> : null}
              {u.skills.length ? <Row k="Skills" v={u.skills.join(", ")} /> : null}
              <Row k="Email" v={u.email ?? "Shared once you shortlist this candidate"} />
              {u.githubUrl ? (
                <Row
                  k="GitHub"
                  v={
                    <a href={u.githubUrl} className="text-brand-600 hover:underline" rel="noopener noreferrer" target="_blank">
                      {u.githubUrl}
                    </a>
                  }
                />
              ) : null}
              {u.linkedinUrl ? (
                <Row
                  k="LinkedIn"
                  v={
                    <a href={u.linkedinUrl} className="text-brand-600 hover:underline" rel="noopener noreferrer" target="_blank">
                      {u.linkedinUrl}
                    </a>
                  }
                />
              ) : null}
            </dl>
            <div className="border-t border-ink-100 px-5 py-4 text-sm">
              {p.resumeUrl ? (
                <a href={p.resumeUrl} className="font-semibold text-brand-600 hover:underline">
                  Download CV ({p.consent.resumeName})
                </a>
              ) : p.resumePending ? (
                <span className="text-ink-500">CV is being scanned for malware.</span>
              ) : (
                <span className="text-ink-500">No CV uploaded.</span>
              )}
            </div>
            {u.bio ? <p className="border-t border-ink-100 px-5 py-4 text-sm whitespace-pre-line text-ink-700">{u.bio}</p> : null}
          </Card>
          <Card>
            <CardHeader title="Verified achievements" description="Certificates can be checked publicly by code." />
            <ul className="space-y-1.5 p-5 text-sm">
              {p.rankBand ? (
                <li>
                  <Badge tone="brand">{p.rankBand}</Badge> in final results
                </li>
              ) : null}
              {p.awards.map((a) => (
                <li key={a}>
                  <Badge tone="success">{a}</Badge>
                </li>
              ))}
              {p.certificates.map((c) => (
                <li key={c.code}>
                  {CERT_LABEL[c.category]} certificate{c.distinction ? ` — ${c.distinction}` : ""} ·{" "}
                  <Link href={`/verify?code=${c.code}`} className="font-mono text-xs text-brand-600 hover:underline">
                    {c.code}
                  </Link>
                </li>
              ))}
              {!p.rankBand && !p.awards.length && !p.certificates.length ? <li className="text-ink-500">Nothing published yet.</li> : null}
            </ul>
          </Card>
          {p.applications.length ? (
            <Card>
              <CardHeader title="Your pipeline with this candidate" />
              <ul className="divide-y divide-ink-100 text-sm">
                {p.applications.map((a) => (
                  <li key={a.id} className="space-y-1 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.opening?.title ?? "General interest"}</span>
                      <span className="text-ink-500">· {a.company}</span>
                      <Badge tone={APPLICATION_STATUS_META[a.status].tone}>{APPLICATION_STATUS_META[a.status].label}</Badge>
                    </div>
                    <ol className="text-xs text-ink-500">
                      {a.events.map((e) => (
                        <li key={e.id}>
                          {formatDate(e.createdAt)} — {APPLICATION_STATUS_META[e.toStatus].label}
                          {e.note ? `: ${e.note}` : ""}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
              <div className="border-t border-ink-100 px-5 py-3 text-sm">
                <Link href={`/organizer/competitions/${id}/hiring?view=pipeline`} className="font-semibold text-brand-600 hover:underline">
                  Manage in pipeline →
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
        <Card>
          <CardHeader title={p.project ? p.project.title : "Project"} description={p.project?.team ? `Team ${p.project.team}` : undefined} />
          <div className="space-y-4 p-5">
            {!p.project ? (
              <p className="text-sm text-ink-500">No project in this competition.</p>
            ) : !p.consent.sharePortfolio ? (
              <p className="text-sm text-ink-500">The candidate chose not to share their submitted project with hiring partners.</p>
            ) : p.submissions.length ? (
              p.submissions.map((s) => <SubmissionView key={s.id} submission={s} />)
            ) : (
              <p className="text-sm text-ink-500">No submissions yet.</p>
            )}
            <p className="text-xs text-ink-400">Judging scores and comments are confidential and never shown to hiring partners.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function BackLink({ id }: { id: string }) {
  return (
    <Link href={`/organizer/competitions/${id}/hiring`} className="text-sm font-semibold text-brand-600 hover:underline">
      ← Talent pool
    </Link>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-ink-500">{k}</dt>
      <dd className="break-words text-ink-800">{v}</dd>
    </div>
  );
}
