import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Badge, DemoBadge, Icon } from "@/components/ui/primitives";
import { CompetitionCard } from "@/components/competitions/competition-card";
import { FaqList } from "@/components/site/faq-list";
import { MentorRegisterForm } from "@/components/site/mentor-register-form";
import { PLATFORM_FAQ } from "@/content/faq";
import { featuredCompetitions, platformStats, publicCategories, upcomingDeadlines } from "@/server/modules/competitions/queries";
import { recentWinners } from "@/server/modules/results/service";
import { relativeFromNow } from "@/lib/time";
import { cached } from "@/server/cache";
import { listPublicOpenings } from "@/server/modules/talent/service";
import { OpeningCard } from "@/components/talent/opening-card";
import { TYPE_LABEL } from "@/lib/labels";
import { mentorDomainOptions } from "@/server/modules/admin/service";
import { homepageTestimonials } from "@/server/modules/content/testimonials";
import { TestimonialCard } from "@/components/site/testimonial-card";
import { LogoMarquee } from "@/components/site/logo-marquee";

export const dynamic = "force-dynamic";

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="mt-2 text-3xl font-extrabold sm:text-[2.1rem]">{title}</h2>
        {description ? <p className="mt-3 text-[15px] leading-7 text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export default async function HomePage() {
  // Public, non-personal sections: cached for 30 s per instance to keep homepage load off the database.
  const [[ideathons, hackathons, deadlines, categories, stats, winners, roles], mentorDomains] = await Promise.all([
    cached("home:sections", 30_000, () =>
      Promise.all([
        featuredCompetitions("IDEATHON"),
        featuredCompetitions("HACKATHON"),
        upcomingDeadlines(5),
        publicCategories(),
        platformStats(),
        recentWinners(3),
        listPublicOpenings({ page: 1 }),
      ]),
    ),
    // Not cached, so a domain a mentor just added under "Other" is offered to the next mentor right away.
    mentorDomainOptions(),
  ]);
  const testimonials = await homepageTestimonials();
  const hasRealStats = stats.competitions > 0;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_75%)]" aria-hidden />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[120px]" aria-hidden />
        <div className="container-page relative grid items-start gap-14 py-20 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div className="animate-fade-up lg:sticky lg:top-24 lg:pt-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-ink-200">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" /> Ideathons · Hackathons · Innovation challenges
            </p>
            <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.05] text-white sm:text-6xl">
              Where ideas become <span className="bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-transparent">winning projects</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-300">
              OmniHack runs the whole competition lifecycle — registration, teams, submissions, multi-round judging, results and verifiable certificates — on
              one secure platform.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/competitions" size="lg" className="bg-brand-500 hover:bg-brand-400">
                Explore competitions <Icon name="arrow" className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/host" size="lg" variant="light">
                Host a competition
              </ButtonLink>
              <Link
                href="#become-a-mentor"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/25 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10 lg:hidden"
              >
                <Icon name="mentor" className="h-4 w-4" /> Become a mentor
              </Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-8">
              {hasRealStats ? (
                <>
                  <div>
                    <dt className="text-xs text-ink-400">Competitions</dt>
                    <dd className="mt-1 font-display text-2xl font-extrabold">{stats.competitions}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-400">Participants</dt>
                    <dd className="mt-1 font-display text-2xl font-extrabold">{stats.participants}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-400">Certificates</dt>
                    <dd className="mt-1 font-display text-2xl font-extrabold">{stats.certificates}</dd>
                  </div>
                </>
              ) : (
                [
                  ["13", "configurable stage types"],
                  ["3", "competition formats"],
                  ["QR", "verifiable certificates"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className="sr-only">{l}</dt>
                    <dd className="font-display text-2xl font-extrabold">{v}</dd>
                    <p className="mt-1 text-xs leading-5 text-ink-400">{l}</p>
                  </div>
                ))
              )}
            </dl>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <MentorRegisterForm domains={mentorDomains.options} />
          </div>
        </div>
      </section>

      {/* Partners & supporters */}
      <section className="border-b border-ink-100 bg-white py-14">
        <div className="container-page mb-8 text-center">
          <div className="eyebrow">Partners & supporters</div>
          <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Working with government, academia and industry</h2>
        </div>
        <LogoMarquee />
      </section>

      {/* Featured competitions */}
      <section className="py-20">
        <div className="container-page">
          <SectionHeading
            eyebrow="Featured ideathons"
            title="Pitch the idea. Prove the impact."
            description="Ideathons reward clear problem framing, originality and feasibility — no code required unless the organizer asks for it."
            action={
              <ButtonLink href="/competitions?type=IDEATHON" variant="outline">
                All ideathons
              </ButtonLink>
            }
          />
          {ideathons.length ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {ideathons.map((c) => (
                <CompetitionCard key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
              No ideathons are open right now. Check back soon or host one.
            </p>
          )}

          <div className="mt-20">
            <SectionHeading
              eyebrow="Featured hackathons"
              title="Build it, ship it, demo it."
              description="Hackathons evaluate working prototypes with repositories, demos and technical documentation."
              action={
                <ButtonLink href="/competitions?type=HACKATHON" variant="outline">
                  All hackathons
                </ButtonLink>
              }
            />
            {hackathons.length ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {hackathons.map((c) => (
                  <CompetitionCard key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">No hackathons are open right now.</p>
            )}
          </div>
        </div>
      </section>

      {/* Deadlines + categories */}
      <section className="border-y border-ink-100 bg-ink-50/60 py-20">
        <div className="container-page grid gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="eyebrow">Upcoming deadlines</div>
            <h2 className="mt-2 text-2xl font-extrabold">Registration closing soon</h2>
            <ul className="mt-6 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white">
              {deadlines.length ? (
                deadlines.map((c) => (
                  <li key={c.id}>
                    <Link href={`/competitions/${c.slug}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-ink-50">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-center text-brand-700">
                        <div>
                          <div className="text-[10px] font-bold uppercase leading-none">
                            {c.registrationClosesAt
                              ? new Intl.DateTimeFormat("en", { month: "short", timeZone: c.timezone }).format(c.registrationClosesAt)
                              : ""}
                          </div>
                          <div className="font-display text-lg font-extrabold leading-tight">
                            {c.registrationClosesAt
                              ? new Intl.DateTimeFormat("en", { day: "numeric", timeZone: c.timezone }).format(c.registrationClosesAt)
                              : ""}
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink-900">{c.title}</p>
                        <p className="text-xs text-ink-500">
                          {TYPE_LABEL[c.type]} · {c.organization.name}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs font-semibold text-amber-700">Closes {relativeFromNow(c.registrationClosesAt!)}</span>
                        {c.isDemo ? <DemoBadge /> : null}
                      </div>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-5 py-8 text-center text-sm text-ink-500">No open registrations at the moment.</li>
              )}
            </ul>
          </div>
          <div>
            <div className="eyebrow">Categories</div>
            <h2 className="mt-2 text-2xl font-extrabold">Find your challenge</h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {(categories.length
                ? categories
                : [
                    { category: "AI & Data", count: 0 },
                    { category: "Sustainability", count: 0 },
                    { category: "Healthcare", count: 0 },
                    { category: "FinTech", count: 0 },
                  ]
              ).map((c) => (
                <Link
                  key={c.category}
                  href={`/competitions?category=${encodeURIComponent(c.category)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:border-brand-300 hover:text-brand-700"
                >
                  {c.category}
                  {c.count ? <span className="rounded-full bg-ink-100 px-1.5 text-xs text-ink-500">{c.count}</span> : null}
                </Link>
              ))}
            </div>
            <div className="mt-8 rounded-2xl bg-ink-950 p-6 text-white">
              <p className="font-display text-lg font-bold">Have a certificate to check?</p>
              <p className="mt-1 text-sm text-ink-300">Confirm any OmniHack certificate in seconds.</p>
              <ButtonLink href="/verify" variant="light" size="sm" className="mt-4">
                Verify a certificate
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container-page">
          <SectionHeading eyebrow="How OmniHack works" title="One workflow from first registration to final certificate" />
          <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Configure",
                "Organizers set up stages, eligibility, challenges, rubrics and prizes in a guided wizard — no code changes per event.",
                "settings",
              ],
              ["Participate", "Participants register, pass eligibility checks, form teams with invite links and pick a challenge.", "users"],
              ["Submit & judge", "Teams submit versioned work; assigned judges score structured scorecards with conflict-of-interest controls.", "gavel"],
              ["Publish & certify", "Approved results go public, and every participant can download a QR-verifiable certificate.", "certificate"],
            ].map(([title, text, icon], i) => (
              <li key={title} className="card relative p-6">
                <span className="absolute right-5 top-5 font-mono text-xs text-ink-300">0{i + 1}</span>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon name={icon} />
                </span>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Benefits */}
      <section className="pb-20">
        <div className="container-page grid gap-6 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl bg-ink-950 p-8 text-white sm:p-10">
            <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
            <div className="relative">
              <Badge tone="brand" className="bg-brand-500/20 text-brand-200 ring-brand-400/30">
                For organizers
              </Badge>
              <h2 className="mt-4 text-2xl font-extrabold text-white sm:text-3xl">Run serious competitions without spreadsheets.</h2>
              <ul className="mt-6 space-y-3 text-sm text-ink-200">
                {[
                  "Configurable multi-round stages with full transition history",
                  "Registration review, team approvals and eligibility rules",
                  "Balanced judge assignment, completion tracking and audited corrections",
                  "Controlled result approval and publication",
                  "Bulk certificates, attendance check-in and CSV reports",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <Icon name="check" className="mt-0.5 h-4 w-4 text-accent-300" />
                    {t}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/host" variant="light" className="mt-8">
                Host a competition
              </ButtonLink>
            </div>
          </div>
          <div className="rounded-3xl border border-ink-100 bg-gradient-to-br from-brand-50 via-white to-cyan-50 p-8 sm:p-10">
            <Badge tone="info">For participants</Badge>
            <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">Focus on the work, not the logistics.</h2>
            <ul className="mt-6 space-y-3 text-sm text-ink-700">
              {[
                "One dashboard for every competition you join",
                "Team invitations by link or email",
                "Private, versioned submissions with clear deadlines",
                "Mentor feedback and published judge feedback in one place",
                "Certificates anyone can verify",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Icon name="check" className="mt-0.5 h-4 w-4 text-brand-600" />
                  {t}
                </li>
              ))}
            </ul>
            <ButtonLink href="/competitions" className="mt-8">
              Find a competition
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Careers: placement, internships & recruitment */}
      <section className="py-20">
        <div className="container-page">
          <SectionHeading
            eyebrow="Careers through competitions"
            title="Win the hackathon. Land the internship."
            description="Companies recruit through OmniHack competitions: internships, pre-placement offers and full-time roles — offered on the strength of real work, with participants in control of who sees their profile."
            action={
              <ButtonLink href="/opportunities" variant="outline">
                All internships & jobs
              </ButtonLink>
            }
          />
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div>
              {roles.items.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {roles.items.slice(0, 4).map((o) => (
                    <OpeningCard key={o.id} o={o} competition={o.competition} timeZone={o.competition.timezone} compact />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
                  No open roles right now. Hiring competitions are marked with a “Hiring” badge.
                </p>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-ink-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-7">
                <h3 className="text-xl font-extrabold">For students & graduates</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-ink-700">
                  {[
                    "Free to join — never pay to be considered",
                    "Opt in per competition; withdraw any time",
                    "Mentor feedback, certificates and a verifiable portfolio",
                    "Track interviews and offers in one place",
                  ].map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <Icon name="check" className="mt-0.5 h-4 w-4 text-emerald-600" />
                      {t}
                    </li>
                  ))}
                </ul>
                <ButtonLink href="/competitions?hiring=1" className="mt-6" size="sm">
                  Find hiring competitions
                </ButtonLink>
              </div>
              <div className="rounded-3xl bg-ink-950 p-7 text-white">
                <h3 className="text-xl font-extrabold text-white">For companies</h3>
                <p className="mt-2 text-sm leading-6 text-ink-300">
                  Sponsor a challenge, mentor teams with your engineers, and hire from a consent-based talent pool — with interview and offer tracking built in.
                </p>
                <ButtonLink href="/hire" variant="light" size="sm" className="mt-5">
                  Hire through hackathons
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mentors & judges */}
      <section className="border-y border-ink-100 bg-white py-20">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="eyebrow">Mentors and judges</div>
            <h2 className="mt-2 text-3xl font-extrabold">Fair, structured evaluation</h2>
            <p className="mt-4 text-[15px] leading-7 text-ink-600">
              Judges only see the projects assigned to them, score against a published rubric with weighted criteria, and can declare conflicts of interest.
              Scores lock on finalization; any later correction requires an authorized organizer and is recorded with a reason. Mentors get a focused view of
              their teams and can leave feedback that teams see in their workspace.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/resources#judges" variant="outline">
                Judging guide
              </ButtonLink>
              <ButtonLink href="/resources#mentors" variant="ghost">
                Mentoring guide
              </ButtonLink>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Sample scorecard</p>
              <Badge tone="neutral">Illustration</Badge>
            </div>
            <div className="mt-5 space-y-4">
              {[
                ["Innovation", 25, 8],
                ["Potential impact", 25, 7.5],
                ["Problem understanding", 20, 9],
                ["Feasibility", 20, 6.5],
                ["Presentation", 10, 8],
              ].map(([name, w, s]) => (
                <div key={name as string}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-ink-800">{name}</span>
                    <span className="tabular-nums text-ink-500">
                      {s}/10 · {w}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500" style={{ width: `${(Number(s) / 10) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-4 text-sm">
              <span className="text-ink-500">Weighted total</span>
              <span className="font-display text-xl font-extrabold">77.5 / 100</span>
            </div>
          </div>
        </div>
      </section>

      {/* Winners */}
      {winners.length ? (
        <section className="py-20">
          <div className="container-page">
            <SectionHeading
              eyebrow="Featured winning projects"
              title="Recently awarded"
              action={
                <ButtonLink href="/winners" variant="outline">
                  All winners
                </ButtonLink>
              }
            />
            <div className="grid gap-6 md:grid-cols-3">
              {winners.map((w) => (
                <article key={w.id} className="card p-6">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="warning">
                      <Icon name="trophy" className="h-3.5 w-3.5" /> {w.prize.title}
                    </Badge>
                    {w.prize.competition.isDemo ? <DemoBadge /> : null}
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{w.project.title}</h3>
                  <p className="text-sm text-ink-500">{w.project.team?.name ?? "Individual entry"}</p>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink-600">{w.project.summary}</p>
                  <Link
                    href={`/competitions/${w.prize.competition.slug}/results`}
                    className="mt-4 inline-flex text-sm font-semibold text-brand-600 hover:underline"
                  >
                    {w.prize.competition.title} results →
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Testimonials: only published + featured ones, managed by the master admin (Admin → Testimonials). */}
      {testimonials.length ? (
        <section className="relative overflow-hidden bg-ink-950 py-20 text-white">
          <div className="bg-grid absolute inset-0 opacity-50" aria-hidden />
          <div className="container-page relative">
            <div className="mb-10 max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-300">What partners say</div>
              <h2 className="mt-2 text-3xl font-extrabold text-white sm:text-[2.1rem]">Trusted by institutions and industry</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <TestimonialCard key={t.id} t={t} dark />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      <section className="bg-ink-50/60 py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <div className="eyebrow">FAQ</div>
            <h2 className="mt-2 text-3xl font-extrabold">Questions, answered</h2>
            <p className="mt-3 text-[15px] leading-7 text-ink-500">
              More in the{" "}
              <Link className="font-semibold text-brand-600 hover:underline" href="/faq">
                full FAQ
              </Link>{" "}
              or{" "}
              <Link className="font-semibold text-brand-600 hover:underline" href="/contact">
                contact us
              </Link>
              .
            </p>
          </div>
          <FaqList items={PLATFORM_FAQ.slice(0, 5)} />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-600 px-8 py-14 text-center text-white sm:px-16">
            <div className="bg-grid absolute inset-0 opacity-50" aria-hidden />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Your next competition starts here.</h2>
              <p className="mt-4 text-lg text-brand-100">Discover an event to join, or launch your own in an afternoon.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/competitions" size="lg" variant="light">
                  Explore competitions
                </ButtonLink>
                <ButtonLink href="/auth/register?intent=host" size="lg" variant="secondary">
                  Start organizing
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
