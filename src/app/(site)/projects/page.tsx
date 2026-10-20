import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { BannerArt } from "@/components/brand/banner-art";
import { Badge, DemoBadge, EmptyState, Icon, Pagination } from "@/components/ui/primitives";
import { listShowcase } from "@/server/modules/showcase/service";
import { TYPE_LABEL } from "@/lib/labels";

export const metadata: Metadata = {
  title: "Project showcase",
  description: "Approved projects from ideathons and hackathons on OmniHack.",
  alternates: { canonical: "/projects" },
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const r = await listShowcase({
    q: sp.q?.slice(0, 100),
    type: ["IDEATHON", "HACKATHON", "HYBRID"].includes(sp.type ?? "") ? sp.type : undefined,
    winners: sp.winners === "1",
    page,
  });
  const qs = (p: number) =>
    `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.type ? { type: sp.type } : {}), ...(sp.winners ? { winners: sp.winners } : {}), page: String(p) })}`;
  return (
    <>
      <PageHero
        eyebrow="Project showcase"
        title="Built on OmniHack"
        description="Projects whose teams chose to share them publicly, approved by the organizers."
      >
        <form className="flex max-w-2xl flex-wrap gap-2" role="search">
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search projects"
            aria-label="Search projects"
            className="h-11 flex-1 rounded-xl border border-ink-200 bg-white px-3 text-sm"
          />
          <select
            name="type"
            defaultValue={sp.type ?? ""}
            aria-label="Competition type"
            className="h-11 rounded-xl border border-ink-200 bg-white px-3 text-sm"
          >
            <option value="">All types</option>
            <option value="IDEATHON">Ideathon</option>
            <option value="HACKATHON">Hackathon</option>
            <option value="HYBRID">Hybrid</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="winners" value="1" defaultChecked={sp.winners === "1"} className="accent-brand-600" /> Winners only
          </label>
          <button className="h-11 rounded-xl bg-ink-950 px-5 text-sm font-semibold text-white">Filter</button>
        </form>
      </PageHero>
      <div className="container-page py-14">
        {r.items.length === 0 ? <EmptyState title="No projects to show yet" icon={<Icon name="layers" />} /> : null}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {r.items.map((p) => (
            <article key={p.id} className="card card-hover relative overflow-hidden">
              <div className="aspect-[2.4/1]">
                <BannerArt seed={p.id} theme={p.awards.length ? "amber" : "violet"} />
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{TYPE_LABEL[p.competition.type]}</Badge>
                  {p.awards.map((a) => (
                    <Badge key={a.prize.title} tone="warning">
                      <Icon name="trophy" className="h-3.5 w-3.5" /> {a.prize.title}
                    </Badge>
                  ))}
                  {p.competition.isDemo ? <DemoBadge /> : null}
                </div>
                <h2 className="mt-3 text-lg font-bold">
                  <Link href={`/projects/${p.id}`} className="after:absolute after:inset-0">
                    {p.title}
                  </Link>
                </h2>
                <p className="text-xs text-ink-500">{p.competition.title}</p>
                <p className="mt-2 line-clamp-3 text-sm text-ink-600">{p.showcaseSummary}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-10">
          <Pagination page={page} pageCount={r.pageCount} hrefFor={qs} />
        </div>
      </div>
    </>
  );
}
