import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { EmptyState, Icon, Pagination } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { OpeningCard } from "@/components/talent/opening-card";
import { listPublicOpenings } from "@/server/modules/talent/service";

export const metadata: Metadata = {
  title: "Internships & jobs",
  description: "Internships, pre-placement offers and jobs you can earn by taking part in ideathons and hackathons on OmniHack.",
  alternates: { canonical: "/opportunities" },
};

const TYPES: [string, string][] = [
  ["", "All"],
  ["INTERNSHIP", "Internships"],
  ["PRE_PLACEMENT_OFFER", "Pre-placement offers"],
  ["FULL_TIME", "Full-time"],
  ["CONTRACT", "Contract"],
];

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const r = await listPublicOpenings({ q: sp.q?.slice(0, 100), type: sp.type, workMode: sp.mode, page });
  const qs = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, type: sp.type, mode: sp.mode, ...changes };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/opportunities${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <PageHero
        eyebrow="Internships & jobs"
        title="Get hired for what you build"
        description="Companies post internships, pre-placement offers and jobs through OmniHack competitions. Take part, show your work, and opt in to be discovered — on your terms."
      >
        <form className="flex max-w-2xl flex-wrap gap-2" role="search">
          {sp.type ? <input type="hidden" name="type" value={sp.type} /> : null}
          <label htmlFor="q" className="sr-only">
            Search roles
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q}
            placeholder="Role, company, skill or city"
            className="h-11 min-w-[240px] flex-1 rounded-xl border border-ink-200 bg-white px-3 text-sm"
          />
          <select name="mode" defaultValue={sp.mode ?? ""} aria-label="Work mode" className="h-11 rounded-xl border border-ink-200 bg-white px-3 text-sm">
            <option value="">Any work mode</option>
            <option value="ONSITE">On-site</option>
            <option value="HYBRID">Hybrid</option>
            <option value="REMOTE">Remote</option>
          </select>
          <button className="h-11 rounded-xl bg-ink-950 px-5 text-sm font-semibold text-white">Search</button>
        </form>
      </PageHero>

      <div className="container-page py-12">
        <div className="mb-6 flex flex-wrap gap-2">
          {TYPES.map(([v, l]) => (
            <Link
              key={l}
              href={qs({ type: v || undefined, page: undefined })}
              aria-current={(sp.type ?? "") === v ? "true" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${(sp.type ?? "") === v ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-700 hover:border-ink-300"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <p className="mb-5 text-sm text-ink-500">
          {r.total} open role{r.total === 1 ? "" : "s"}
        </p>
        {r.items.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {r.items.map((o) => (
              <OpeningCard key={o.id} o={o} competition={o.competition} timeZone={o.competition.timezone} compact />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No open roles match right now"
            description="New internships and jobs appear whenever a hiring competition is published."
            icon={<Icon name="briefcase" />}
            action={<ButtonLink href="/competitions?hiring=1">Browse hiring competitions</ButtonLink>}
          />
        )}
        <div className="mt-10">
          <Pagination page={r.page} pageCount={r.pageCount} hrefFor={(p) => qs({ page: String(p) })} />
        </div>

        <section className="mt-16 grid gap-6 rounded-3xl border border-ink-100 bg-ink-50/60 p-8 md:grid-cols-4">
          {[
            ["1. Register", "Join a competition marked “Hiring”.", "users"],
            ["2. Build", "Compete, get mentor feedback and submit your work.", "code"],
            ["3. Opt in", "Join the talent pool from your workspace — add your CV and preferences.", "shield"],
            ["4. Get hired", "Hiring partners shortlist, interview and make offers through OmniHack.", "briefcase"],
          ].map(([t, d, icon]) => (
            <div key={t}>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
                <Icon name={icon} />
              </span>
              <h2 className="mt-3 font-bold">{t}</h2>
              <p className="mt-1 text-sm leading-6 text-ink-600">{d}</p>
            </div>
          ))}
        </section>
        <p className="mt-6 text-sm text-ink-500">
          Hiring for your company?{" "}
          <Link href="/hire" className="font-semibold text-brand-600 hover:underline">
            Recruit through hackathons →
          </Link>
        </p>
      </div>
    </>
  );
}
