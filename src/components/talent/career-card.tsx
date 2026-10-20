import Link from "next/link";
import type { JobOpening, TalentConsent } from "@prisma/client";
import { Badge, Card, CardHeader, Icon } from "@/components/ui/primitives";
import { ActionForm, Checkbox, SubmitButton, TextInput } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm";
import { signedResumeUrl } from "@/server/modules/talent/service";
import { utcToZonedLocal } from "@/lib/time";
import { talentConsentAction, withdrawConsentAction } from "@/app/(app)/dashboard/actions";
import { OPENING_TYPE_LABEL } from "./opening-card";

const TYPES = ["INTERNSHIP", "PRE_PLACEMENT_OFFER", "FULL_TIME", "CONTRACT"] as const;

export function CareerCard({
  competitionId,
  openings,
  consent,
  approved,
  timeZone,
}: {
  competitionId: string;
  openings: Pick<JobOpening, "id" | "company" | "title" | "type">[];
  consent: TalentConsent | null;
  approved: boolean;
  timeZone: string;
}) {
  const active = consent && !consent.withdrawnAt;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon name="briefcase" className="h-5 w-5 text-emerald-600" /> Career opportunities
          </span>
        }
        description={`${openings.length} open role${openings.length === 1 ? "" : "s"} from hiring partners`}
        action={active ? <Badge tone="success">In talent pool</Badge> : null}
      />
      <div className="space-y-4 p-5 text-sm">
        {openings.length ? (
          <ul className="space-y-1.5">
            {openings.slice(0, 5).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{o.title}</span>
                <span className="text-ink-500">· {o.company}</span>
                <Badge>{OPENING_TYPE_LABEL[o.type]}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {!approved ? (
          <p className="text-ink-500">You can join the talent pool once your registration is approved.</p>
        ) : active ? (
          <div className="space-y-3">
            <p className="text-ink-600">
              Hiring partners of this competition can view your profile{consent.sharePortfolio ? " and submitted project" : ""}. They never see judges' scores
              or comments.
            </p>
            {consent.resumeKey ? (
              <p>
                CV:{" "}
                <a href={signedResumeUrl(consent.id)} className="font-semibold text-brand-600 hover:underline">
                  {consent.resumeName}
                </a>{" "}
                {consent.resumeScanStatus === "PENDING" ? <span className="text-xs text-ink-400">(being scanned)</span> : null}
              </p>
            ) : (
              <p className="text-amber-700">No CV uploaded yet — add one below to stand out.</p>
            )}
            <details>
              <summary className="cursor-pointer font-semibold text-ink-700">Update preferences or CV</summary>
              <ConsentForm competitionId={competitionId} consent={consent} timeZone={timeZone} />
            </details>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/opportunities" className="font-semibold text-brand-600 hover:underline">
                Track interviews & offers →
              </Link>
              <ConfirmAction
                action={withdrawConsentAction.bind(null, competitionId)}
                label="Leave the talent pool"
                variant="ghost"
                title="Leave the talent pool?"
                description="Your profile will be hidden from hiring partners immediately, your CV will be deleted, and any open applications will be closed."
                confirmLabel="Leave talent pool"
              />
            </div>
          </div>
        ) : (
          <ConsentForm competitionId={competitionId} consent={consent} timeZone={timeZone} />
        )}
      </div>
    </Card>
  );
}

function ConsentForm({ competitionId, consent, timeZone }: { competitionId: string; consent: TalentConsent | null; timeZone: string }) {
  const c = consent && !consent.withdrawnAt ? consent : null;
  return (
    <ActionForm action={talentConsentAction.bind(null, competitionId)} className="mt-3 space-y-3">
      <fieldset>
        <legend className="mb-1.5 font-semibold text-ink-800">I'm interested in</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {TYPES.map((t) => (
            <Checkbox
              key={t}
              name="roleInterests"
              value={t}
              label={OPENING_TYPE_LABEL[t]}
              defaultChecked={c ? c.roleInterests.includes(t) : t === "INTERNSHIP"}
            />
          ))}
        </div>
      </fieldset>
      <TextInput
        label="Preferred locations"
        name="preferredLocations"
        defaultValue={c?.preferredLocations.join(", ") ?? ""}
        hint="Comma-separated, e.g. Bengaluru, Remote"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Available from" name="availableFrom" type="datetime-local" defaultValue={utcToZonedLocal(c?.availableFrom, timeZone)} />
        <TextInput label="Graduation year" name="graduationYear" type="number" min={1990} max={2100} defaultValue={c?.graduationYear ?? ""} />
      </div>
      <label className="block">
        <span className="mb-1.5 block font-semibold text-ink-800">CV (PDF, up to 5 MB){c?.resumeKey ? " — upload to replace" : ""}</span>
        <input
          type="file"
          name="resume"
          accept=".pdf"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-700"
        />
      </label>
      <Checkbox
        name="sharePortfolio"
        defaultChecked={c?.sharePortfolio ?? true}
        label="Let hiring partners read my submitted project (code links, documents, demo)"
      />
      <Checkbox name="adultConfirmed" defaultChecked={Boolean(c)} label="I confirm I am 18 or older" />
      <Checkbox
        name="consent"
        defaultChecked={Boolean(c)}
        label="I agree that this competition's hiring partners may view my profile, CV and certificates for recruitment. My email is shared only when a company shortlists me. I can withdraw at any time."
      />
      <SubmitButton size="sm">{c ? "Save preferences" : "Join the talent pool"}</SubmitButton>
    </ActionForm>
  );
}
