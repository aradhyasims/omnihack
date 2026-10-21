import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetitionBanner } from "@/components/competitions/competition-card";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, DemoBadge, Icon } from "@/components/ui/primitives";
import { FaqList } from "@/components/site/faq-list";
import { getCurrentUser } from "@/server/auth/current";
import { getCompetitionPage } from "@/server/modules/competitions/queries";
import { competitionOpenings } from "@/server/modules/talent/service";
import { OpeningCard } from "@/components/talent/opening-card";
import { RULE_KEYS } from "@/server/modules/competitions/lifecycle";
import { STAGE_TYPE_LABELS } from "@/server/modules/stages/templates";
import {
  COMPETITION_STATUS_META,
  ELIGIBILITY_LABEL,
  eligibilitySummary,
  formatFee,
  MODE_LABEL,
  REG_STATE_META,
  REGISTRATION_STATUS_META,
  teamSummary,
  TYPE_LABEL,
} from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/time";
import { eventTestimonials } from "@/server/modules/content/testimonials";
import { TestimonialCard } from "@/components/site/testimonial-card";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCompetitionPage(slug, null);
  if (!page) return { title: "Competition not found", robots: { index: false } };
  const c = page.competition;
  return {
    title: c.title,
    description: c.tagline,
    alternates: { canonical: `/competitions/${c.slug}` },
    robots: c.visibility === "PUBLIC" ? undefined : { index: false, follow: false },
    openGraph: { title: c.title, description: c.tagline, type: "website", url: `/competitions/${c.slug}` },
  };
}

function DocumentLink({ href, name, label, className = "" }: { href: string; name: string | null; label: string; className?: string }) {
  const pdf = /\.pdf$/i.test(href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`flex items-center gap-3 rounded-xl border border-ink-100 px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/40 ${className}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon name="file" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        <span className="block truncate text-xs text-ink-500">{name ?? (pdf ? "PDF" : "Image")}</span>
      </span>
      <span className="text-sm font-semibold text-brand-600">{pdf ? "Open PDF" : "View"} →</span>
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-ink-100 py-10 first:border-t-0 first:pt-0">
      <h2 className="mb-5 text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

export default async function CompetitionDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const page = await getCompetitionPage(slug, user);
  if (!page) notFound();
  const { competition: c, registration, myRegistration, isPreview, isStaff, lockedChallengeCount } = page;
  const tz = c.timezone;
  const reg = REG_STATE_META[registration];
  const judges = c.members.filter((m) => m.role === "JUDGE");
  const mentors = c.members.filter((m) => m.role === "MENTOR");
  const judgedStages = c.stages.filter((s) => s.isJudged && s.rubric?.criteria.length);
  const rules = (c.rules ?? {}) as Record<string, string>;
  const faqs = (c.faqs ?? []) as { q: string; a: string }[];
  const [openings, testimonials] = await Promise.all([c.hiringEnabled ? competitionOpenings(c.id) : [], eventTestimonials(c.id)]);
  const keyDates: [string, Date | null][] = [
    ["Registration opens", c.registrationOpensAt],
    ["Registration closes", c.registrationClosesAt],
    ["Team formation deadline", c.participationMode !== "INDIVIDUAL" ? c.teamFormationDeadline : null],
    ["Event starts", c.startsAt],
    ["Event ends", c.endsAt],
    ["Results", c.resultsAt],
    ["Certificates available", c.certificatesAt],
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: c.title,
    description: c.tagline,
    startDate: c.startsAt?.toISOString(),
    endDate: c.endsAt?.toISOString(),
    eventStatus: c.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode:
      c.mode === "ONLINE"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : c.mode === "OFFLINE"
          ? "https://schema.org/OfflineEventAttendanceMode"
          : "https://schema.org/MixedEventAttendanceMode",
    organizer: { "@type": "Organization", name: c.organization.name },
    location:
      c.mode === "ONLINE" ? { "@type": "VirtualLocation", url: `/competitions/${c.slug}` } : { "@type": "Place", name: c.venueName, address: c.venueAddress },
  };

  const cta = (() => {
    if (myRegistration && myRegistration.status !== "WITHDRAWN") {
      const meta = REGISTRATION_STATUS_META[myRegistration.status];
      return (
        <div className="space-y-3">
          <Badge tone={meta.tone} dot>
            You are registered · {meta.label}
          </Badge>
          <ButtonLink href={`/dashboard/competitions/${c.slug}`} className="w-full">
            Open your workspace
          </ButtonLink>
        </div>
      );
    }
    if (registration === "OPEN")
      return (
        <ButtonLink href={`/competitions/${c.slug}/register`} size="lg" className="w-full">
          Register now
        </ButtonLink>
      );
    if (registration === "UPCOMING") return <p className="text-sm text-ink-600">Registration opens {formatDateTime(c.registrationOpensAt, tz)}.</p>;
    if (registration === "FULL") return <p className="text-sm text-ink-600">This competition has reached its participant limit.</p>;
    if (registration === "CLOSED") return <p className="text-sm text-ink-600">Registration has closed.</p>;
    if (registration === "COMPLETED" && c.resultsStatus === "PUBLISHED")
      return (
        <ButtonLink href={`/competitions/${c.slug}/results`} className="w-full">
          View results
        </ButtonLink>
      );
    return null;
  })();

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {isPreview ? (
        <div className="bg-amber-100 py-2 text-center text-sm font-semibold text-amber-900">
          Preview — this competition is {COMPETITION_STATUS_META[c.status].label.toLowerCase()} and not visible to the public.{" "}
          <Link href={`/organizer/competitions/${c.id}`} className="underline">
            Back to management
          </Link>
        </div>
      ) : null}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <CompetitionBanner c={c} className="absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-ink-950/20" aria-hidden />
        <div className="container-page relative pb-12 pt-24 sm:pt-32">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="dark" className="bg-white/10 ring-white/20">
              {TYPE_LABEL[c.type]}
            </Badge>
            <Badge tone="dark" className="bg-white/10 ring-white/20">
              {MODE_LABEL[c.mode]}
            </Badge>
            <Badge tone={reg.tone} dot>
              {reg.label}
            </Badge>
            {c.isDemo ? <DemoBadge /> : null}
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-extrabold leading-tight text-white sm:text-5xl">{c.title}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-ink-200">{c.tagline}</p>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-300">
            Organized by <span className="font-semibold text-white">{c.organization.name}</span>
            {c.organization.verified ? (
              <span className="inline-flex items-center gap-1 text-accent-300">
                <Icon name="shield" className="h-4 w-4" /> Verified
              </span>
            ) : null}
          </p>
        </div>
      </section>

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {c.status === "CANCELLED" ? (
            <Alert tone="danger" title="This competition was cancelled" className="mb-8">
              {c.cancellationReason}
            </Alert>
          ) : null}
          <nav aria-label="On this page" className="sticky top-16 z-10 -mx-4 mb-8 overflow-x-auto border-b border-ink-100 bg-white/90 px-4 backdrop-blur">
            <ul className="flex gap-1 whitespace-nowrap py-2 text-sm font-semibold text-ink-600">
              {[
                ["overview", "Overview"],
                ["challenges", "Challenges"],
                ["timeline", "Timeline"],
                ["prizes", "Prizes"],
                ...(openings.length ? [["opportunities", "Internships & jobs"]] : []),
                ["judging", "Judging"],
                ["rules", "Rules"],
                ["faq", "FAQ"],
              ].map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="rounded-lg px-3 py-1.5 hover:bg-ink-50 hover:text-ink-900">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {c.reportKey || testimonials.length ? (
            <Section id="report" title="Event report">
              {c.reportKey ? <DocumentLink href={`/media/${c.reportKey}`} name={c.reportName} label="Final report" /> : null}
              {testimonials.length ? (
                <div className={`grid gap-4 sm:grid-cols-2 ${c.reportKey ? "mt-6" : ""}`}>
                  {testimonials.map((t) => (
                    <TestimonialCard key={t.id} t={t} />
                  ))}
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section id="overview" title="Overview">
            <div className="prose-om whitespace-pre-line">{c.description}</div>
            {c.catalogKey ? (
              <div className="mt-6">
                {/\.(png|jpe?g)$/i.test(c.catalogKey) ? (
                  <a href={`/media/${c.catalogKey}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-2xl border border-ink-100">
                    {/* eslint-disable-next-line @next/next/no-img-element -- organizer-uploaded catalog served by /media */}
                    <img src={`/media/${c.catalogKey}`} alt={`${c.title} event catalog`} className="w-full" loading="lazy" />
                  </a>
                ) : null}
                <DocumentLink href={`/media/${c.catalogKey}`} name={c.catalogName} label="Event catalog" className="mt-3" />
              </div>
            ) : null}
            {c.tags.length ? (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {c.tags.map((t) => (
                  <Badge key={t}>#{t}</Badge>
                ))}
              </div>
            ) : null}
            {c.tracks.length ? (
              <div className="mt-8">
                <h3 className="text-sm font-bold uppercase tracking-wide text-ink-500">Tracks</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {c.tracks.map((t) => (
                    <div key={t.id} className="rounded-xl border border-ink-100 p-4">
                      <p className="font-semibold">{t.name}</p>
                      {t.description ? <p className="mt-1 text-sm text-ink-500">{t.description}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>

          <Section id="challenges" title="Themes & problem statements">
            <div className="space-y-4">
              {c.challenges.map((ch, i) => (
                <article key={ch.id} className="card p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink-400">PS-{String(i + 1).padStart(2, "0")}</span>
                    {ch.track ? <Badge tone="brand">{ch.track.name}</Badge> : null}
                    {ch.visibility === "REGISTERED" ? <Badge tone="info">Registered participants</Badge> : null}
                    {ch.visibility === "HIDDEN" ? <Badge tone="warning">Hidden (staff preview)</Badge> : null}
                  </div>
                  <h3 className="mt-2 text-lg font-bold">{ch.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-600">{ch.description}</p>
                  {ch.context || ch.desiredOutcome || ch.submissionRequirements ? (
                    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                      {ch.context ? (
                        <div>
                          <dt className="font-semibold text-ink-800">Context</dt>
                          <dd className="mt-1 text-ink-600">{ch.context}</dd>
                        </div>
                      ) : null}
                      {ch.desiredOutcome ? (
                        <div>
                          <dt className="font-semibold text-ink-800">Desired outcome</dt>
                          <dd className="mt-1 text-ink-600">{ch.desiredOutcome}</dd>
                        </div>
                      ) : null}
                      {ch.submissionRequirements ? (
                        <div>
                          <dt className="font-semibold text-ink-800">Submission requirements</dt>
                          <dd className="mt-1 text-ink-600">{ch.submissionRequirements}</dd>
                        </div>
                      ) : null}
                      {ch.eligibilityNote ? (
                        <div>
                          <dt className="font-semibold text-ink-800">Eligibility</dt>
                          <dd className="mt-1 text-ink-600">{ch.eligibilityNote}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  {ch.referenceLinks.length ? (
                    <ul className="mt-4 flex flex-wrap gap-3 text-sm">
                      {ch.referenceLinks.map((l) => (
                        <li key={l}>
                          <a
                            href={l}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
                          >
                            Reference <Icon name="external" className="h-3.5 w-3.5" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
              {lockedChallengeCount > 0 ? (
                <p className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">
                  <Icon name="lock" className="mr-1 inline h-4 w-4" /> {lockedChallengeCount} more problem statement{lockedChallengeCount > 1 ? "s are" : " is"}{" "}
                  visible to registered participants.
                </p>
              ) : null}
              {c.challenges.length === 0 && lockedChallengeCount === 0 ? (
                <p className="text-sm text-ink-500">Problem statements will be announced soon.</p>
              ) : null}
            </div>
          </Section>

          <Section id="timeline" title="Timeline & stages">
            <ol className="relative space-y-6 border-l-2 border-ink-100 pl-6">
              {c.stages.map((s) => (
                <li key={s.id} className="relative">
                  <span
                    className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 ${s.status === "COMPLETED" ? "border-brand-600 bg-brand-600" : s.status === "OPEN" || s.status === "JUDGING" ? "border-emerald-500 bg-white" : "border-ink-300 bg-white"}`}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{s.name}</h3>
                    <span className="text-xs text-ink-400">{STAGE_TYPE_LABELS[s.type]}</span>
                    {s.status === "OPEN" ? (
                      <Badge tone="success">Open now</Badge>
                    ) : s.status === "JUDGING" ? (
                      <Badge tone="brand">Judging</Badge>
                    ) : s.status === "COMPLETED" ? (
                      <Badge>Completed</Badge>
                    ) : null}
                  </div>
                  {s.startsAt || s.endsAt ? (
                    <p className="mt-0.5 text-sm text-ink-500">
                      {formatDateTime(s.startsAt, tz)} → {formatDateTime(s.endsAt, tz)}
                    </p>
                  ) : null}
                  {s.description ? <p className="mt-1 text-sm leading-6 text-ink-600">{s.description}</p> : null}
                  {s.onlyAdvancedProjects ? <p className="mt-1 text-xs font-medium text-ink-500">Shortlisted projects only</p> : null}
                </li>
              ))}
            </ol>
            {c.sessions.length ? (
              <div className="mt-10">
                <h3 className="text-sm font-bold uppercase tracking-wide text-ink-500">Event schedule</h3>
                <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100">
                  {c.sessions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="font-semibold">{s.title}</span>
                      <span className="text-ink-500">
                        {formatDateTime(s.startsAt, tz)}
                        {s.location ? ` · ${s.location}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>

          <Section id="prizes" title="Prizes & awards">
            {c.prizes.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {c.prizes.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-ink-100 bg-gradient-to-br from-amber-50/60 to-white p-5">
                    <div className="flex items-center gap-2 text-amber-700">
                      <Icon name="trophy" className="h-5 w-5" />
                      <span className="text-xs font-bold uppercase tracking-wide">
                        {p.category === "TRACK" && p.track ? `${p.track.name} track` : p.category.replace("_", "-").toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-2 text-lg font-bold">{p.title}</p>
                    {p.valueText ? (
                      <p className="mt-1 text-sm font-semibold text-ink-800">
                        {p.valueText}
                        {!p.valueVerified ? <span className="ml-1 text-xs font-normal text-ink-400">(as stated by organizer)</span> : null}
                      </p>
                    ) : null}
                    {p.description ? <p className="mt-1 text-sm text-ink-600">{p.description}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">Prizes will be announced by the organizer.</p>
            )}
          </Section>

          {openings.length ? (
            <Section id="opportunities" title="Internships & jobs">
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm leading-6 text-emerald-950">
                <p className="font-semibold">Hiring partners are recruiting through this competition.</p>
                <p className="mt-1">
                  After you register, you can choose to join the talent pool from your workspace. Hiring partners only see participants who opt in, and they
                  never see judges' scores or comments. You can withdraw at any time.
                </p>
                {c.hiringNote ? <p className="mt-2 whitespace-pre-line">{c.hiringNote}</p> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {openings.map((o) => (
                  <OpeningCard key={o.id} o={o} timeZone={tz} />
                ))}
              </div>
            </Section>
          ) : null}

          <Section id="judging" title="Judging criteria">
            {judgedStages.length ? (
              <div className="space-y-6">
                {judgedStages.map((s) => (
                  <div key={s.id}>
                    <h3 className="font-bold">{s.name}</h3>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-ink-100">
                      <table className="table-om">
                        <thead>
                          <tr>
                            <th>Criterion</th>
                            <th className="w-24 text-right">Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.rubric!.criteria.map((cr) => (
                            <tr key={cr.id}>
                              <td>
                                <span className="font-semibold text-ink-900">{cr.name}</span>
                                {cr.description ? <span className="block text-xs text-ink-500">{cr.description}</span> : null}
                              </td>
                              <td className="text-right font-semibold tabular-nums">{cr.weight}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                <p className="text-xs leading-5 text-ink-500">
                  Scores are combined as weighted averages across judges; ties are broken by the organizer’s tie-break criteria, then by earlier submission
                  time. See the{" "}
                  <Link href="/resources#scoring" className="font-semibold text-brand-600 hover:underline">
                    scoring method
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Judging criteria will be published before evaluation begins.</p>
            )}
            {judges.length || mentors.length ? (
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {[
                  ["Judges", judges],
                  ["Mentors", mentors],
                ].map(([label, list]) =>
                  (list as typeof judges).length ? (
                    <div key={label as string}>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-500">{label as string}</h3>
                      <ul className="mt-3 space-y-2">
                        {(list as typeof judges).map((m) => (
                          <li key={m.id} className="flex items-center gap-3">
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-100 text-sm font-bold text-ink-700">
                              {m.user.name.charAt(0)}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold">{m.user.name}</span>
                              <span className="block text-xs text-ink-500">{m.expertise ?? m.user.headline ?? ""}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}
          </Section>

          <Section id="rules" title="Rules & policies">
            <div className="space-y-3">
              {RULE_KEYS.filter(([k]) => rules[k]).map(([k, label]) => (
                <details key={k} className="group rounded-xl border border-ink-100 px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
                    {label}
                    <Icon name="chevron" className="h-4 w-4 text-ink-400 transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-600">{rules[k]}</p>
                </details>
              ))}
            </div>
          </Section>

          <Section id="faq" title="Frequently asked questions">
            {faqs.length ? (
              <FaqList items={faqs} />
            ) : (
              <p className="text-sm text-ink-500">
                No competition-specific FAQs yet. See the{" "}
                <Link href="/faq" className="font-semibold text-brand-600">
                  platform FAQ
                </Link>
                .
              </p>
            )}
          </Section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card overflow-hidden">
            <div className="border-b border-ink-100 p-5">
              <Badge tone={reg.tone} dot>
                {reg.label}
              </Badge>
              <div className="mt-4">{cta}</div>
              {isStaff ? (
                <Link href={`/organizer/competitions/${c.id}`} className="mt-3 block text-center text-sm font-semibold text-brand-600 hover:underline">
                  Manage competition
                </Link>
              ) : null}
            </div>
            <dl className="divide-y divide-ink-100 text-sm">
              {[
                ["Eligibility", eligibilitySummary(c.eligibilityTypes)],
                ["Team size", teamSummary(c.participationMode, c.minTeamSize, c.maxTeamSize)],
                ["Entry fee", formatFee(c.isPaid, c.feeAmountMinor, c.currency)],
                ["Format", `${MODE_LABEL[c.mode]}${c.city ? ` · ${c.city}` : ""}`],
                ["Language", c.language],
                ["Participants", `${c._count.registrations}${c.maxParticipants ? ` / ${c.maxParticipants}` : ""} registered`],
                ["Times shown in", tz],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-5 py-3">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-right font-semibold text-ink-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="card mt-4 p-5">
            <h2 className="text-sm font-bold">Important dates</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              {keyDates
                .filter(([, d]) => d)
                .map(([label, d]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="text-right font-medium text-ink-800">{formatDate(d, tz)}</dd>
                  </div>
                ))}
            </dl>
          </div>
          {c.mode !== "ONLINE" && c.venueName ? (
            <div className="card mt-4 p-5 text-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <Icon name="location" className="h-4 w-4 text-brand-600" /> Venue
              </h2>
              <p className="mt-2 font-semibold">{c.venueName}</p>
              <p className="text-ink-500">{c.venueAddress}</p>
            </div>
          ) : null}
          {c.eligibilityTypes.length && !c.eligibilityTypes.includes("OPEN") ? (
            <div className="card mt-4 p-5 text-sm">
              <h2 className="font-bold">Who can take part</h2>
              <ul className="mt-2 list-inside list-disc text-ink-600">
                {c.eligibilityTypes.map((t) => (
                  <li key={t}>{ELIGIBILITY_LABEL[t]}</li>
                ))}
                {c.minAge != null || c.maxAge != null ? (
                  <li>
                    Age {c.minAge ?? "any"}–{c.maxAge ?? "any"}
                  </li>
                ) : null}
                {c.institutionRequirement ? <li>{c.institutionRequirement}</li> : null}
                {c.geoRestriction ? <li>Located in: {c.geoRestriction}</li> : null}
              </ul>
            </div>
          ) : null}
          {c.sponsors.length ? (
            <div className="card mt-4 p-5 text-sm">
              <h2 className="font-bold">Sponsors</h2>
              <ul className="mt-2 space-y-1">
                {c.sponsors.map((s) => (
                  <li key={s.id}>
                    <span className="font-semibold">{s.sponsor.name}</span> <span className="text-ink-500">· {s.tier}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {c.contactEmail ? (
            <div className="card mt-4 p-5 text-sm">
              <h2 className="font-bold">Contact</h2>
              <p className="mt-2 text-ink-600">{c.contactName}</p>
              <a href={`mailto:${c.contactEmail}`} className="font-semibold text-brand-600 hover:underline">
                {c.contactEmail}
              </a>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
