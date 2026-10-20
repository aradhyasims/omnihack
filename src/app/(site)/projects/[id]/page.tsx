import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BannerArt } from "@/components/brand/banner-art";
import { Badge, DemoBadge, Icon } from "@/components/ui/primitives";
import { getShowcaseProject } from "@/server/modules/showcase/service";
import { TYPE_LABEL } from "@/lib/labels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getShowcaseProject(id);
  return p
    ? { title: p.title, description: p.showcaseSummary ?? undefined, alternates: { canonical: `/projects/${id}` } }
    : { title: "Project not found", robots: { index: false } };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getShowcaseProject(id);
  if (!p) notFound();
  return (
    <article>
      <div className="h-48 sm:h-64">
        <BannerArt seed={p.id} theme={p.awards.length ? "amber" : "violet"} />
      </div>
      <div className="container-page max-w-4xl -mt-16 pb-16">
        <div className="card p-6 sm:p-10">
          <div className="flex flex-wrap gap-2">
            <Badge>{TYPE_LABEL[p.competition.type]}</Badge>
            {p.awards.map((a) => (
              <Badge key={a.prize.title} tone="warning">
                <Icon name="trophy" className="h-3.5 w-3.5" /> {a.prize.title}
              </Badge>
            ))}
            {p.competition.isDemo ? <DemoBadge /> : null}
          </div>
          <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">{p.title}</h1>
          <p className="mt-2 text-sm text-ink-500">
            <Link href={`/competitions/${p.competition.slug}`} className="font-semibold text-brand-600 hover:underline">
              {p.competition.title}
            </Link>
            {p.challenge ? ` · ${p.challenge.title}` : ""}
            {p.track ? ` · ${p.track.name}` : ""}
          </p>
          {p.members.length ? (
            <p className="mt-1 text-sm text-ink-600">
              {p.team?.name ? `${p.team.name}: ` : ""}
              {p.members.join(", ")}
            </p>
          ) : p.team ? (
            <p className="mt-1 text-sm text-ink-600">Team {p.team.name}</p>
          ) : null}
          <div className="prose-om mt-8 whitespace-pre-line">{p.showcaseSummary}</div>
          {p.showcaseImpact ? (
            <div className="mt-8 rounded-xl bg-brand-50/60 p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-brand-800">Outcome & impact</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-700">{p.showcaseImpact}</p>
            </div>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            {p.demoUrl ? (
              <a
                href={p.demoUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Live demo <Icon name="external" className="h-4 w-4" />
              </a>
            ) : null}
            {p.repoUrl ? (
              <a
                href={p.repoUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold hover:bg-ink-50"
              >
                <Icon name="code" className="h-4 w-4" /> Source code
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
