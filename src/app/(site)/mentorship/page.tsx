import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/primitives";
import { listPublicMentors, mentorDomainOptions } from "@/server/modules/admin/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mentorship",
  description: "Meet the industry mentors who guide OmniHack teams, and volunteer to become one.",
  alternates: { canonical: "/mentorship" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default async function MentorshipPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [all, { options, labels }] = await Promise.all([listPublicMentors(), mentorDomainOptions()]);
  const domain = options.find((d) => d.value === sp.domain);
  const mentors = domain ? all.filter((m) => m.domains.includes(domain.value)) : all;
  const counts = new Map<string, number>();
  for (const m of all) for (const d of m.domains) counts.set(d, (counts.get(d) ?? 0) + 1);
  // Domains with mentors first (most mentors first), keeping list order for ties; empty domains last.
  const filters = options.map((d, i) => ({ ...d, count: counts.get(d.value) ?? 0, i })).sort((a, b) => b.count - a.count || a.i - b.i);
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
      active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700"
    }`;
  const countBadge = (active: boolean, n: number) => (
    <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{n}</span>
  );
  return (
    <>
      <PageHero
        dark
        eyebrow="Mentorship"
        title="Learn from people who have built it before."
        description="Industry professionals volunteer their time to guide OmniHack teams — from sharpening the problem statement to polishing the final demo."
      >
        <div className="flex flex-wrap items-center gap-4">
          <ButtonLink href="/#become-a-mentor" size="lg" className="bg-brand-500 hover:bg-brand-400">
            Become a mentor <Icon name="arrow" className="h-4 w-4" />
          </ButtonLink>
          {all.length ? (
            <p className="text-sm text-ink-300">
              <span className="font-display text-xl font-extrabold text-white">{all.length}</span> registered mentor{all.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </PageHero>

      <section className="py-16">
        <div className="container-page">
          {all.length ? (
            <nav aria-label="Filter mentors by domain" className="mb-8">
              <p className="mb-3 text-sm font-semibold text-ink-800">Filter by domain</p>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <Link href="/mentorship" scroll={false} className={chip(!domain)} aria-current={!domain ? "page" : undefined}>
                    View all {countBadge(!domain, all.length)}
                  </Link>
                </li>
                {filters.map((d) => {
                  const active = domain?.value === d.value;
                  return (
                    <li key={d.value}>
                      <Link
                        href={`/mentorship?domain=${d.value}`}
                        scroll={false}
                        className={`${chip(active)} ${d.count === 0 && !active ? "opacity-60" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        {d.label} {countBadge(active, d.count)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-sm text-ink-500" aria-live="polite">
                {domain ? (
                  <>
                    Showing {mentors.length} mentor{mentors.length === 1 ? "" : "s"} in <strong className="text-ink-800">{domain.label}</strong>
                  </>
                ) : (
                  <>Showing all {all.length} mentors</>
                )}
              </p>
            </nav>
          ) : null}
          {mentors.length ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {mentors.map((m) => (
                <li key={m.id} className="card flex flex-col items-center px-5 pb-5 pt-7 text-center">
                  {/* The photo leads the profile; the short info box below carries the essentials. */}
                  {m.photoKey ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded media is served by /media, same as competition banners
                    <img
                      src={`/media/${m.photoKey}`}
                      alt={m.name}
                      className="h-32 w-32 shrink-0 rounded-full object-cover shadow-lg shadow-brand-900/10 ring-4 ring-brand-100"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-display text-4xl font-extrabold text-white shadow-lg shadow-brand-900/10 ring-4 ring-brand-100"
                      aria-hidden
                    >
                      {initials(m.name)}
                    </span>
                  )}
                  <div className="mt-5 flex w-full flex-1 flex-col items-center rounded-2xl bg-ink-50/80 px-4 py-4 ring-1 ring-ink-100">
                    <h2 className="w-full truncate text-base font-bold text-ink-950" title={m.name}>
                      {m.name}
                    </h2>
                    <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">{m.designation}</p>
                    {m.domains.length ? (
                      <ul className="mt-3 flex flex-wrap justify-center gap-1.5" aria-label="Domains">
                        {m.domains.map((d) => (
                          <li key={d}>
                            <Link
                              href={`/mentorship?domain=${d}`}
                              scroll={false}
                              className="inline-block rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200/70 hover:bg-brand-50"
                            >
                              {labels[d] ?? d}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <a
                      href={m.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-brand-600 hover:underline"
                    >
                      LinkedIn <Icon name="external" className="h-3.5 w-3.5" />
                      <span className="sr-only"> profile of {m.name} (opens in a new tab)</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : domain ? (
            <div className="rounded-2xl border border-dashed border-ink-200 p-10 text-center">
              <p className="font-semibold text-ink-800">No {domain.label} mentors yet.</p>
              <p className="mt-1 text-sm text-ink-500">Work in this field? Register and be the first.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/#become-a-mentor">Become a mentor</ButtonLink>
                <ButtonLink href="/mentorship" variant="outline">
                  View all mentors
                </ButtonLink>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink-200 p-10 text-center">
              <p className="font-semibold text-ink-800">No mentors have registered yet.</p>
              <p className="mt-1 text-sm text-ink-500">Be the first to guide the next generation of builders.</p>
              <ButtonLink href="/#become-a-mentor" className="mt-5">
                Become a mentor
              </ButtonLink>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
