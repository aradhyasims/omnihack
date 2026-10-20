import type { Metadata } from "next";
import Link from "next/link";
import { CompetitionCard } from "@/components/competitions/competition-card";
import { EmptyState, Icon, Pagination } from "@/components/ui/primitives";
import { listPublicCompetitions, publicCategories, publicOrganizers, type CompetitionFilters } from "@/server/modules/competitions/queries";
import { cn } from "@/lib/cn";
import { cached } from "@/server/cache";

export const metadata: Metadata = {
  title: "Competitions",
  description: "Search and filter ideathons, hackathons and hybrid innovation challenges on OmniHack.",
  alternates: { canonical: "/competitions" },
};

type SP = Record<string, string | string[] | undefined>;
const FILTER_KEYS = ["q", "type", "mode", "phase", "category", "eligibility", "participation", "fee", "deadline", "organizer", "hiring"] as const;

function pick(sp: SP): CompetitionFilters {
  const f: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v) f[k] = v.slice(0, 100);
  }
  return { ...f, page: Number(sp.page) || 1 };
}

function hrefWith(current: CompetitionFilters, changes: Record<string, string | null>) {
  const params = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = k in changes ? changes[k] : (current as Record<string, unknown>)[k];
    if (typeof v === "string" && v) params.set(k, v);
  }
  if ("page" in changes && changes.page) params.set("page", changes.page);
  const s = params.toString();
  return `/competitions${s ? `?${s}` : ""}`;
}

function FilterGroup({
  title,
  name,
  options,
  current,
}: {
  title: string;
  name: (typeof FILTER_KEYS)[number];
  options: [string, string][];
  current: CompetitionFilters;
}) {
  const active = (current as Record<string, unknown>)[name];
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([value, label]) => {
          const on = active === value;
          return (
            <Link
              key={value}
              href={hrefWith(current, { [name]: on ? null : value, page: null })}
              aria-current={on ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                on ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </fieldset>
  );
}

export default async function CompetitionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters = pick(sp);
  const [result, [categories, organizers]] = await Promise.all([
    listPublicCompetitions(filters),
    cached("competitions:filters", 60_000, () => Promise.all([publicCategories(), publicOrganizers()])),
  ]);
  const activeCount = FILTER_KEYS.filter((k) => k !== "q" && (filters as Record<string, unknown>)[k]).length;

  return (
    <div>
      <section className="border-b border-ink-100 bg-ink-50/60">
        <div className="container-page py-12">
          <div className="eyebrow">Competitions</div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Find your next challenge</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-500">
            Ideathons, hackathons and idea-to-prototype challenges from organizations on OmniHack.
          </p>
          <form action="/competitions" method="get" className="mt-6 flex max-w-2xl gap-2" role="search">
            {FILTER_KEYS.filter((k) => k !== "q" && (filters as Record<string, unknown>)[k]).map((k) => (
              <input key={k} type="hidden" name={k} value={String((filters as Record<string, unknown>)[k])} />
            ))}
            <label htmlFor="q" className="sr-only">
              Search competitions
            </label>
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                id="q"
                name="q"
                defaultValue={filters.q}
                placeholder="Search by name, topic or organizer"
                className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm shadow-xs focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>
            <button className="h-11 rounded-xl bg-ink-950 px-5 text-sm font-semibold text-white hover:bg-ink-800">Search</button>
          </form>
        </div>
      </section>

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[260px_1fr]">
        <aside aria-label="Filters" className="space-y-6">
          <details className="group" open>
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold lg:hidden [&::-webkit-details-marker]:hidden">
              Filters {activeCount ? `(${activeCount})` : ""}
              <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="mt-4 space-y-6 lg:mt-0">
              <FilterGroup title="Careers" name="hiring" current={filters} options={[["1", "Internships & jobs offered"]]} />
              <FilterGroup
                title="Type"
                name="type"
                current={filters}
                options={[
                  ["IDEATHON", "Ideathon"],
                  ["HACKATHON", "Hackathon"],
                  ["HYBRID", "Hybrid"],
                ]}
              />
              <FilterGroup
                title="Status"
                name="phase"
                current={filters}
                options={[
                  ["open", "Registration open"],
                  ["upcoming", "Upcoming"],
                  ["ongoing", "Ongoing"],
                  ["completed", "Completed"],
                ]}
              />
              <FilterGroup
                title="Format"
                name="mode"
                current={filters}
                options={[
                  ["ONLINE", "Online"],
                  ["OFFLINE", "In person"],
                  ["HYBRID", "Hybrid"],
                ]}
              />
              <FilterGroup
                title="Eligibility"
                name="eligibility"
                current={filters}
                options={[
                  ["STUDENT", "Students"],
                  ["PROFESSIONAL", "Professionals"],
                  ["STARTUP", "Startups"],
                  ["OPEN", "Open to all"],
                ]}
              />
              <FilterGroup
                title="Participation"
                name="participation"
                current={filters}
                options={[
                  ["INDIVIDUAL", "Individual"],
                  ["TEAM", "Team"],
                ]}
              />
              <FilterGroup
                title="Entry fee"
                name="fee"
                current={filters}
                options={[
                  ["free", "Free"],
                  ["paid", "Paid"],
                ]}
              />
              <FilterGroup
                title="Deadline"
                name="deadline"
                current={filters}
                options={[
                  ["7", "Next 7 days"],
                  ["30", "Next 30 days"],
                ]}
              />
              {categories.length ? (
                <FilterGroup title="Category" name="category" current={filters} options={categories.map((c) => [c.category, c.category])} />
              ) : null}
              {organizers.length ? (
                <FilterGroup title="Organizer" name="organizer" current={filters} options={organizers.map((o) => [o.slug, o.name])} />
              ) : null}
              {activeCount || filters.q ? (
                <Link href="/competitions" className="inline-block text-sm font-semibold text-brand-600 hover:underline">
                  Clear all filters
                </Link>
              ) : null}
            </div>
          </details>
        </aside>

        <section aria-live="polite">
          <p className="mb-5 text-sm text-ink-500">
            {result.total} competition{result.total === 1 ? "" : "s"}
            {filters.q ? (
              <>
                {" "}
                matching “<span className="font-semibold text-ink-800">{filters.q}</span>”
              </>
            ) : null}
          </p>
          {result.items.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {result.items.map((c) => (
                <CompetitionCard key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No competitions match these filters"
              description="Try removing a filter or searching for a broader term."
              icon={<Icon name="search" />}
              action={
                <Link href="/competitions" className="text-sm font-semibold text-brand-600 hover:underline">
                  Clear filters
                </Link>
              }
            />
          )}
          <div className="mt-10">
            <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(p) => hrefWith(filters, { page: String(p) })} />
          </div>
        </section>
      </div>
    </div>
  );
}
