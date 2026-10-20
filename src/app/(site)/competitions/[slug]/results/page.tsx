import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";
import { Badge, DemoBadge, Icon } from "@/components/ui/primitives";
import { publicResults } from "@/server/modules/results/service";
import { formatDate } from "@/lib/time";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await publicResults(slug);
  return r
    ? { title: `Results — ${r.competition.title}`, alternates: { canonical: `/competitions/${slug}/results` } }
    : { title: "Results not available", robots: { index: false } };
}

export default async function PublicResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await publicResults(slug);
  if (!r) notFound();
  const c = r.competition;
  return (
    <>
      <PageHero
        eyebrow="Official results"
        title={c.title}
        description={`Organized by ${c.organization.name} · published ${formatDate(c.resultsPublishedAt, c.timezone)}`}
      >
        <div className="flex gap-2">
          {c.isDemo ? <DemoBadge /> : null}
          <Link href={`/competitions/${slug}`} className="text-sm font-semibold text-brand-600 hover:underline">
            ← Competition page
          </Link>
        </div>
      </PageHero>
      <div className="container-page space-y-12 py-14">
        <section>
          <h2 className="text-2xl font-extrabold">Winners</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {r.prizes.flatMap((p) =>
              p.winners.map((w) => (
                <article key={w.id} className="card relative overflow-hidden p-6">
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-100" aria-hidden />
                  <div className="relative">
                    <Badge tone="warning">
                      <Icon name="trophy" className="h-3.5 w-3.5" /> {p.title}
                      {p.track ? ` · ${p.track.name}` : ""}
                    </Badge>
                    <h3 className="mt-4 text-xl font-extrabold">{w.project.title}</h3>
                    {w.members.length ? <p className="mt-1 text-sm text-ink-500">{w.members.join(", ")}</p> : null}
                    {w.citation ? <p className="mt-3 text-sm italic text-ink-600">“{w.citation}”</p> : null}
                    {w.project.summary ? <p className="mt-3 line-clamp-3 text-sm text-ink-600">{w.project.summary}</p> : null}
                    {w.project.showcaseStatus === "PUBLISHED" ? (
                      <Link href={`/projects/${w.project.id}`} className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
                        View project →
                      </Link>
                    ) : null}
                  </div>
                </article>
              )),
            )}
          </div>
        </section>
        {r.finalists.length ? (
          <section>
            <h2 className="text-2xl font-extrabold">Finalists</h2>
            <ol className="mt-5 divide-y divide-ink-100 rounded-2xl border border-ink-100">
              {r.finalists.map((f) => (
                <li key={f.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-8 font-display text-lg font-bold text-ink-400">{f.stageResults[0]?.rank ?? "—"}</span>
                  <span className="font-semibold">{f.title}</span>
                  {f.team ? <span className="text-sm text-ink-500">{f.team.name}</span> : null}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-ink-500">
              Positions reflect the approved final-stage ranking. Individual scores and judge comments are confidential.
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}
