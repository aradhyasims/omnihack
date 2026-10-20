import Link from "next/link";
import { BannerArt } from "@/components/brand/banner-art";
import { Badge, DemoBadge, Icon } from "@/components/ui/primitives";
import { eligibilitySummary, formatFee, MODE_LABEL, PHASE_META, REG_STATE_META, teamSummary, TYPE_LABEL } from "@/lib/labels";
import { formatDate, relativeFromNow } from "@/lib/time";
import type { CompetitionCardData } from "@/server/modules/competitions/queries";

export function CompetitionBanner({
  c,
  className,
}: {
  c: { slug: string; bannerTheme: string; bannerImageKey: string | null; title: string };
  className?: string;
}) {
  return (
    <div className={className}>
      {c.bannerImageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${c.bannerImageKey}`} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <BannerArt seed={c.slug} theme={c.bannerTheme} />
      )}
    </div>
  );
}

export function CompetitionCard({ c }: { c: CompetitionCardData }) {
  const phase = PHASE_META[c.phase];
  const reg = REG_STATE_META[c.registration];
  const deadline = c.registration === "OPEN" && c.registrationClosesAt ? c.registrationClosesAt : null;
  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden">
      <div className="relative aspect-[2/1] overflow-hidden">
        <CompetitionBanner c={c} className="h-full w-full transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge tone="dark" className="bg-ink-950/80 backdrop-blur">
            {TYPE_LABEL[c.type]}
          </Badge>
          {c.hiringEnabled && c._count.openings > 0 ? (
            <Badge tone="success" className="bg-emerald-500 text-white ring-emerald-400">
              <Icon name="briefcase" className="h-3.5 w-3.5" /> Hiring
            </Badge>
          ) : null}
          {c.isDemo ? <DemoBadge /> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={c.registration === "FULL" || c.registration === "CANCELLED" ? reg.tone : phase.tone} dot>
            {c.registration === "FULL" || c.registration === "CANCELLED" ? reg.label : phase.label}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-500">
            <Icon name={c.mode === "ONLINE" ? "globe" : "location"} className="h-3.5 w-3.5" />
            {MODE_LABEL[c.mode]}
            {c.mode !== "ONLINE" && c.city ? ` · ${c.city}` : ""}
          </span>
        </div>
        <h3 className="mt-3 text-lg font-bold leading-snug">
          <Link href={`/competitions/${c.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {c.title}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-500">
          by {c.organization.name}
          {c.organization.verified ? (
            <span title="Verified organizer" className="text-brand-600">
              <Icon name="shield" className="h-4 w-4" />
            </span>
          ) : null}
        </p>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-600">{c.tagline}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-ink-100 pt-4 text-xs">
          <div>
            <dt className="text-ink-400">{deadline ? "Registration closes" : c.phase === "upcoming" ? "Registration opens" : "Event dates"}</dt>
            <dd className="mt-0.5 font-semibold text-ink-800">
              {deadline
                ? formatDate(deadline, c.timezone)
                : c.phase === "upcoming"
                  ? formatDate(c.registrationOpensAt, c.timezone)
                  : `${formatDate(c.startsAt, c.timezone)}`}
            </dd>
          </div>
          <div>
            <dt className="text-ink-400">Eligibility</dt>
            <dd className="mt-0.5 truncate font-semibold text-ink-800">{eligibilitySummary(c.eligibilityTypes)}</dd>
          </div>
          <div>
            <dt className="text-ink-400">Format</dt>
            <dd className="mt-0.5 font-semibold text-ink-800">{teamSummary(c.participationMode, c.minTeamSize, c.maxTeamSize)}</dd>
          </div>
          <div>
            <dt className="text-ink-400">Entry</dt>
            <dd className="mt-0.5 font-semibold text-ink-800">{formatFee(c.isPaid, c.feeAmountMinor, c.currency)}</dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="text-xs font-medium text-ink-500">{deadline ? `Closes ${relativeFromNow(deadline)}` : `${c._count.registrations} registered`}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2">
            {c.registration === "OPEN" ? "View & register" : c.phase === "completed" ? "View results" : "View details"}
            <Icon name="arrow" className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
