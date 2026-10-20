import Link from "next/link";
import type { JobOpening } from "@prisma/client";
import { Badge, DemoBadge, Icon } from "@/components/ui/primitives";
import { formatDate } from "@/lib/time";

export const OPENING_TYPE_LABEL: Record<string, string> = {
  INTERNSHIP: "Internship",
  FULL_TIME: "Full-time",
  PRE_PLACEMENT_OFFER: "Pre-placement offer",
  CONTRACT: "Contract",
};
export const WORK_MODE_LABEL: Record<string, string> = { ONSITE: "On-site", REMOTE: "Remote", HYBRID: "Hybrid" };

type Opening = Pick<
  JobOpening,
  "id" | "company" | "title" | "type" | "workMode" | "locations" | "skills" | "description" | "compensation" | "durationText" | "positions" | "closesAt"
>;

export function OpeningCard({
  o,
  competition,
  timeZone = "UTC",
  compact = false,
}: {
  o: Opening;
  competition?: { title: string; slug: string; isDemo?: boolean };
  timeZone?: string;
  compact?: boolean;
}) {
  return (
    <article className="card flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={o.type === "INTERNSHIP" ? "info" : o.type === "PRE_PLACEMENT_OFFER" ? "brand" : "success"}>{OPENING_TYPE_LABEL[o.type]}</Badge>
        <Badge>{WORK_MODE_LABEL[o.workMode]}</Badge>
        {competition?.isDemo ? <DemoBadge /> : null}
      </div>
      <h3 className="mt-3 text-lg font-bold leading-snug">{o.title}</h3>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
        <Icon name="briefcase" className="h-4 w-4 text-brand-600" /> {o.company}
      </p>
      <dl className="mt-3 space-y-1 text-sm text-ink-600">
        {o.locations.length ? (
          <div className="flex gap-1.5">
            <dt className="sr-only">Location</dt>
            <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            <dd>{o.locations.join(" · ")}</dd>
          </div>
        ) : null}
        {o.compensation ? (
          <div>
            <dt className="inline font-medium text-ink-800">{o.type === "INTERNSHIP" ? "Stipend" : "Compensation"}: </dt>
            <dd className="inline">{o.compensation}</dd>
          </div>
        ) : null}
        {o.durationText ? (
          <div>
            <dt className="inline font-medium text-ink-800">Duration: </dt>
            <dd className="inline">{o.durationText}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline font-medium text-ink-800">Positions: </dt>
          <dd className="inline">{o.positions}</dd>
        </div>
        {o.closesAt ? (
          <div>
            <dt className="inline font-medium text-ink-800">Hiring until: </dt>
            <dd className="inline">{formatDate(o.closesAt, timeZone)}</dd>
          </div>
        ) : null}
      </dl>
      {!compact && o.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink-600">{o.description}</p> : null}
      {o.skills.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {o.skills.slice(0, 8).map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </div>
      ) : null}
      {competition ? (
        <div className="mt-auto pt-4">
          <Link href={`/competitions/${competition.slug}#opportunities`} className="text-sm font-semibold text-brand-600 hover:underline">
            Through: {competition.title} →
          </Link>
        </div>
      ) : null}
    </article>
  );
}
