import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader, Icon } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { ButtonLink } from "@/components/ui/button";
import { BANNER_THEMES, BannerArt } from "@/components/brand/banner-art";
import { CustomFieldsEditor, FaqEditor } from "@/components/organizer/json-editors";
import { StageManager } from "@/components/organizer/stage-manager";
import { db } from "@/server/db";
import { getPublishIssues } from "@/server/modules/competitions/service";
import { RULE_KEYS } from "@/server/modules/competitions/lifecycle";
import { COMMON_TIMEZONES, utcToZonedLocal } from "@/lib/time";
import { cn } from "@/lib/cn";
import {
  addTrackAction,
  deleteChallengeAction,
  deletePrizeAction,
  deleteTrackAction,
  publishAction,
  saveStepAction,
  setVisibilityAction,
  upsertChallengeAction,
  upsertPrizeAction,
} from "../../../actions";
import { loadManaged } from "../load";

const STEPS = ["Basics", "Type", "Delivery", "Eligibility", "Challenges", "Dates", "Prizes", "Evaluation", "Rules", "Publish"];

function StepActions({ step }: { step: number }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-5">
      <SubmitButton variant="outline">Save draft</SubmitButton>
      {step < 10 ? (
        <SubmitButton name="next" value="1">
          Save & continue →
        </SubmitButton>
      ) : null}
    </div>
  );
}

export default async function WizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { competition: base, can } = await loadManaged(id);
  if (!can("competition.edit")) redirect(`/organizer/competitions/${id}`);
  const step = Math.min(10, Math.max(1, Number(sp.step) || base.wizardStep || 1));
  const c = await db.competition.findUniqueOrThrow({
    where: { id },
    include: {
      tracks: { orderBy: { order: "asc" } },
      challenges: { orderBy: { order: "asc" } },
      prizes: { orderBy: { order: "asc" }, include: { track: true } },
    },
  });
  const tz = c.timezone;
  const save = saveStepAction.bind(null, id, step);
  const trackOptions = c.tracks.map((t) => ({ value: t.id, label: t.name }));
  const editingLocked = c.status === "CANCELLED" || c.status === "ARCHIVED";

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Setup steps" className="lg:sticky lg:top-6 lg:self-start">
        <ol className="flex gap-1 overflow-x-auto lg:flex-col">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < c.wizardStep;
            return (
              <li key={label}>
                <Link
                  href={`?step=${n}`}
                  aria-current={n === step ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
                    n === step ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-50",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                      n === step ? "bg-brand-600 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-ink-100 text-ink-500",
                    )}
                  >
                    {done && n !== step ? <Icon name="check" className="h-3.5 w-3.5" /> : n}
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 space-y-6">
        {editingLocked ? <Alert tone="warning">This competition can no longer be edited.</Alert> : null}
        {c.status === "PUBLISHED" ? (
          <Alert tone="info">This competition is live. Changes are visible to participants immediately and are recorded in the audit log.</Alert>
        ) : null}

        {step === 1 ? (
          <Card>
            <CardHeader title="1. Basic details" description="What participants see first." />
            <ActionForm action={save} className="grid gap-5 p-5 sm:grid-cols-2" encType="multipart/form-data">
              <TextInput label="Event name" name="title" defaultValue={c.title} required className="sm:col-span-2" />
              <TextInput
                label="URL slug"
                name="slug"
                defaultValue={c.slug}
                required
                hint={`omnihack…/competitions/${c.slug}${c.status !== "DRAFT" ? " (locked after publishing)" : ""}`}
                readOnly={c.status !== "DRAFT"}
              />
              <TextInput label="Category" name="category" defaultValue={c.category} required hint="e.g. AI & Data, Sustainability, Healthcare" />
              <TextInput label="Short description" name="tagline" defaultValue={c.tagline} required maxLength={200} className="sm:col-span-2" />
              <TextArea label="Full description" name="description" defaultValue={c.description} required rows={8} className="sm:col-span-2" />
              <TextInput label="Tags" name="tags" defaultValue={c.tags.join(", ")} hint="Comma-separated" />
              <TextInput label="Event language" name="language" defaultValue={c.language} required />
              <TextInput label="Contact person" name="contactName" defaultValue={c.contactName ?? ""} />
              <TextInput label="Contact email" name="contactEmail" type="email" defaultValue={c.contactEmail ?? ""} required />
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-semibold text-ink-800">Banner</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {BANNER_THEMES.map((t) => (
                    <label
                      key={t}
                      className="relative aspect-[2/1] cursor-pointer overflow-hidden rounded-lg ring-offset-2 has-[:checked]:ring-2 has-[:checked]:ring-brand-600"
                    >
                      <input type="radio" name="bannerTheme" value={t} defaultChecked={c.bannerTheme === t} className="sr-only" />
                      <BannerArt seed={c.slug} theme={t} />
                      <span className="sr-only">{t}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-semibold text-ink-800">Or upload a banner image</span>
                    <input
                      type="file"
                      name="bannerImage"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-700"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-semibold text-ink-800">Event logo (optional)</span>
                    <input
                      type="file"
                      name="logoImage"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-700"
                    />
                  </label>
                </div>
                {c.bannerImageKey ? <Checkbox name="removeBanner" label="Remove uploaded banner image" className="mt-2" /> : null}
                <p className="mt-1 text-xs text-ink-500">PNG, JPG or WebP up to 5 MB. Use images you have the right to publish.</p>
              </fieldset>
              <div className="sm:col-span-2">
                <StepActions step={1} />
              </div>
            </ActionForm>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <CardHeader title="2. Competition type" description="Changing the type while in draft replaces the default stage sequence." />
            <ActionForm action={save} className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["IDEATHON", "Ideathon", "Ideas, no prototype required."],
                  ["HACKATHON", "Hackathon", "Working prototypes and code."],
                  ["HYBRID", "Ideathon → Hackathon", "Best ideas advance to a build phase."],
                ].map(([v, t, d]) => (
                  <label key={v} className="cursor-pointer rounded-xl border border-ink-200 p-4 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                    <input type="radio" name="type" value={v} defaultChecked={c.type === v} className="sr-only" disabled={c.status !== "DRAFT"} />
                    <span className="font-bold">{t}</span>
                    <span className="mt-1 block text-xs text-ink-500">{d}</span>
                  </label>
                ))}
              </div>
              {c.status !== "DRAFT" ? <input type="hidden" name="type" value={c.type} /> : null}
              <StepActions step={2} />
            </ActionForm>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <CardHeader title="3. Delivery format" description="All dates are entered and displayed in the event timezone." />
            <ActionForm action={save} className="grid gap-5 p-5 sm:grid-cols-2">
              <Select
                label="Format"
                name="mode"
                defaultValue={c.mode}
                options={[
                  { value: "ONLINE", label: "Online" },
                  { value: "OFFLINE", label: "In person" },
                  { value: "HYBRID", label: "Hybrid" },
                ]}
              />
              <Select
                label="Event timezone"
                name="timezone"
                defaultValue={c.timezone}
                options={[...new Set([c.timezone, ...COMMON_TIMEZONES])].map((t) => ({ value: t, label: t }))}
              />
              <TextInput label="Venue name" name="venueName" defaultValue={c.venueName ?? ""} hint="Required for in-person and hybrid events" />
              <TextInput label="City" name="city" defaultValue={c.city ?? ""} />
              <TextInput label="Venue address" name="venueAddress" defaultValue={c.venueAddress ?? ""} className="sm:col-span-2" />
              <TextInput label="Country" name="country" defaultValue={c.country ?? ""} />
              <TextInput
                label="Meeting link"
                name="meetingUrl"
                type="url"
                defaultValue={c.meetingUrl ?? ""}
                hint="Shared with participants on their workspace"
              />
              <TextArea
                label="Online participation instructions"
                name="onlineInstructions"
                defaultValue={c.onlineInstructions ?? ""}
                rows={3}
                className="sm:col-span-2"
              />
              <div className="sm:col-span-2">
                <StepActions step={3} />
              </div>
            </ActionForm>
          </Card>
        ) : null}

        {step === 4 ? (
          <Card>
            <CardHeader
              title="4. Eligibility & participation"
              description="Age requirements are optional — only collect age when your event genuinely needs it."
            />
            <ActionForm action={save} className="grid gap-5 p-5 sm:grid-cols-2">
              <Select
                label="Participation"
                name="participationMode"
                defaultValue={c.participationMode}
                options={[
                  { value: "TEAM", label: "Teams only" },
                  { value: "INDIVIDUAL", label: "Individuals only" },
                  { value: "BOTH", label: "Individuals or teams" },
                ]}
              />
              <TextInput
                label="Maximum participants"
                name="maxParticipants"
                type="number"
                min={1}
                defaultValue={c.maxParticipants ?? ""}
                hint="Leave empty for no limit"
              />
              <TextInput label="Minimum team size" name="minTeamSize" type="number" min={1} defaultValue={c.minTeamSize} />
              <TextInput label="Maximum team size" name="maxTeamSize" type="number" min={1} defaultValue={c.maxTeamSize} />
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-semibold text-ink-800">Who is eligible?</legend>
                <div className="flex flex-wrap gap-4">
                  {[
                    ["OPEN", "Open to everyone"],
                    ["STUDENT", "Students"],
                    ["PROFESSIONAL", "Professionals"],
                    ["STARTUP", "Startups"],
                  ].map(([v, l]) => (
                    <Checkbox key={v} name="eligibilityTypes" value={v} label={l} defaultChecked={c.eligibilityTypes.includes(v)} />
                  ))}
                </div>
              </fieldset>
              <TextInput label="Minimum age" name="minAge" type="number" defaultValue={c.minAge ?? ""} />
              <TextInput label="Maximum age" name="maxAge" type="number" defaultValue={c.maxAge ?? ""} />
              <TextInput
                label="Institution / organization requirement"
                name="institutionRequirement"
                defaultValue={c.institutionRequirement ?? ""}
                hint="e.g. Must be enrolled at a recognised university"
              />
              <TextInput
                label="Geographic restriction"
                name="geoRestriction"
                defaultValue={c.geoRestriction ?? ""}
                hint="Comma-separated countries; empty = worldwide"
              />
              <TextInput
                label="Required documents"
                name="requiredDocuments"
                defaultValue={c.requiredDocuments.join(", ")}
                className="sm:col-span-2"
                hint="e.g. Student ID — listed for participants"
              />
              <div className="sm:col-span-2">
                <CustomFieldsEditor name="customFields" initial={(c.customFields ?? []) as never} />
              </div>
              <Checkbox
                name="requireRegistrationApproval"
                label="Review each registration manually before approving"
                defaultChecked={c.requireRegistrationApproval}
                className="sm:col-span-2"
              />
              <div className="sm:col-span-2">
                <StepActions step={4} />
              </div>
            </ActionForm>
          </Card>
        ) : null}

        {step === 5 ? (
          <div className="space-y-6">
            <Card>
              <CardHeader title="5a. Tracks" description="Optional groupings for challenges and track-specific awards." />
              <div className="space-y-4 p-5">
                <ul className="flex flex-wrap gap-2">
                  {c.tracks.map((t) => (
                    <li key={t.id} className="flex items-center gap-1 rounded-full border border-ink-200 py-1 pl-3 pr-1 text-sm">
                      {t.name}
                      <InlineAction action={deleteTrackAction.bind(null, id, t.id)} variant="ghost" className="inline-flex">
                        ✕
                      </InlineAction>
                    </li>
                  ))}
                </ul>
                <ActionForm action={addTrackAction.bind(null, id)} resetOnSuccess className="flex flex-wrap items-end gap-3">
                  <TextInput label="Track name" name="name" required />
                  <TextInput label="Description" name="description" />
                  <SubmitButton variant="outline">Add track</SubmitButton>
                </ActionForm>
              </div>
            </Card>
            <Card>
              <CardHeader
                title="5b. Problem statements & challenges"
                description="Publish at least one challenge. 'Registered only' challenges are hidden from the public page."
              />
              <div className="space-y-4 p-5">
                {[...c.challenges, null].map((ch) => (
                  <details key={ch?.id ?? "new"} open={!ch && c.challenges.length === 0} className="rounded-xl border border-ink-100 p-4">
                    <summary className="cursor-pointer font-semibold">
                      {ch ? ch.title : "+ Add a challenge"}{" "}
                      {ch && ch.visibility !== "PUBLIC" ? <Badge className="ml-2">{ch.visibility.toLowerCase()}</Badge> : null}
                    </summary>
                    <ActionForm action={upsertChallengeAction.bind(null, id)} resetOnSuccess={!ch} className="mt-4 grid gap-4 sm:grid-cols-2">
                      {ch ? <input type="hidden" name="id" value={ch.id} /> : null}
                      <TextInput label="Title" name="title" defaultValue={ch?.title ?? ""} required className="sm:col-span-2" />
                      <TextArea label="Description" name="description" defaultValue={ch?.description ?? ""} required rows={3} className="sm:col-span-2" />
                      <TextArea label="Problem context" name="context" defaultValue={ch?.context ?? ""} rows={2} />
                      <TextArea label="Desired outcome" name="desiredOutcome" defaultValue={ch?.desiredOutcome ?? ""} rows={2} />
                      <Select label="Track" name="trackId" placeholder="No track" defaultValue={ch?.trackId ?? ""} options={trackOptions} />
                      <Select
                        label="Visibility"
                        name="visibility"
                        defaultValue={ch?.visibility ?? "PUBLIC"}
                        options={[
                          { value: "PUBLIC", label: "Public" },
                          { value: "REGISTERED", label: "Registered participants only" },
                          { value: "HIDDEN", label: "Hidden (draft)" },
                        ]}
                      />
                      <TextArea label="Submission requirements" name="submissionRequirements" defaultValue={ch?.submissionRequirements ?? ""} rows={2} />
                      <TextArea label="Evaluation notes" name="evaluationNotes" defaultValue={ch?.evaluationNotes ?? ""} rows={2} />
                      <TextInput label="Eligibility note" name="eligibilityNote" defaultValue={ch?.eligibilityNote ?? ""} />
                      <TextInput
                        label="Reference links"
                        name="referenceLinks"
                        defaultValue={ch?.referenceLinks.join(", ") ?? ""}
                        hint="Comma-separated https:// links"
                      />
                      <div className="flex gap-2 sm:col-span-2">
                        <SubmitButton size="sm">{ch ? "Save challenge" : "Add challenge"}</SubmitButton>
                      </div>
                    </ActionForm>
                    {ch ? (
                      <div className="mt-3">
                        <ConfirmAction
                          action={deleteChallengeAction.bind(null, id, ch.id)}
                          label="Delete challenge"
                          variant="ghost"
                          title={`Delete "${ch.title}"?`}
                          confirmLabel="Delete"
                        />
                      </div>
                    ) : null}
                  </details>
                ))}
                <ButtonLink href="?step=6" variant="outline" size="sm">
                  Continue to dates →
                </ButtonLink>
              </div>
            </Card>
          </div>
        ) : null}

        {step === 6 ? (
          <Card>
            <CardHeader
              title="6. Dates & schedule"
              description={`All times in ${tz}. Stage windows, mentor sessions and presentation slots are set on the Stages and Event ops tabs.`}
            />
            <ActionForm action={save} className="grid gap-5 p-5 sm:grid-cols-2">
              {(
                [
                  ["registrationOpensAt", "Registration opens"],
                  ["registrationClosesAt", "Registration deadline"],
                  ["teamFormationDeadline", "Team formation deadline"],
                  ["startsAt", "Event starts"],
                  ["endsAt", "Event ends / final submission deadline"],
                  ["resultsAt", "Result publication (planned)"],
                  ["certificatesAt", "Certificates available (planned)"],
                ] as const
              ).map(([k, l]) => (
                <TextInput key={k} label={l} name={k} type="datetime-local" defaultValue={utcToZonedLocal(c[k], tz)} />
              ))}
              <div className="sm:col-span-2">
                <StepActions step={6} />
              </div>
            </ActionForm>
          </Card>
        ) : null}

        {step === 7 ? (
          <Card>
            <CardHeader
              title="7. Prizes & awards"
              description="Only state prize values that are confirmed. Unverified values are labelled on the public page."
            />
            <div className="space-y-4 p-5">
              {[...c.prizes, null].map((p) => (
                <details key={p?.id ?? "new"} open={!p && c.prizes.length === 0} className="rounded-xl border border-ink-100 p-4">
                  <summary className="cursor-pointer font-semibold">{p ? `${p.title}${p.rank ? ` (rank ${p.rank})` : ""}` : "+ Add a prize"}</summary>
                  <ActionForm action={upsertPrizeAction.bind(null, id)} resetOnSuccess={!p} className="mt-4 grid gap-4 sm:grid-cols-2">
                    {p ? <input type="hidden" name="id" value={p.id} /> : null}
                    <TextInput label="Title" name="title" defaultValue={p?.title ?? ""} required />
                    <Select
                      label="Category"
                      name="category"
                      defaultValue={p?.category ?? "OVERALL"}
                      options={[
                        { value: "OVERALL", label: "Overall ranking" },
                        { value: "TRACK", label: "Track award" },
                        { value: "SPECIAL", label: "Special recognition" },
                        { value: "SPONSOR", label: "Sponsor award" },
                        { value: "NON_MONETARY", label: "Non-monetary recognition" },
                      ]}
                    />
                    <TextInput
                      label="Rank"
                      name="rank"
                      type="number"
                      min={1}
                      defaultValue={p?.rank ?? ""}
                      hint="1 = first. Used to fill ranked prizes automatically."
                    />
                    <Select label="Track (for track awards)" name="trackId" placeholder="—" defaultValue={p?.trackId ?? ""} options={trackOptions} />
                    <TextInput label="Value" name="valueText" defaultValue={p?.valueText ?? ""} hint="e.g. ₹50,000 or Incubation support" />
                    <Checkbox name="valueVerified" label="Value is confirmed" defaultChecked={p?.valueVerified} />
                    <TextArea label="Description" name="description" defaultValue={p?.description ?? ""} rows={2} className="sm:col-span-2" />
                    <div className="sm:col-span-2">
                      <SubmitButton size="sm">{p ? "Save prize" : "Add prize"}</SubmitButton>
                    </div>
                  </ActionForm>
                  {p ? (
                    <div className="mt-3">
                      <ConfirmAction
                        action={deletePrizeAction.bind(null, id, p.id)}
                        label="Delete prize"
                        variant="ghost"
                        title={`Delete "${p.title}"?`}
                        confirmLabel="Delete"
                      />
                    </div>
                  ) : null}
                </details>
              ))}
              <ButtonLink href="?step=8" variant="outline" size="sm">
                Continue to evaluation →
              </ButtonLink>
            </div>
          </Card>
        ) : null}

        {step === 8 ? (
          <div className="space-y-4">
            <Alert tone="info" title="8. Evaluation configuration">
              Configure each stage's scoring rubric (weights must total 100%), minimum judges per project and advancement rule. Judges are added on the People
              tab and assigned on the Judging tab.
            </Alert>
            <StageManager competitionId={id} tz={tz} />
            <ButtonLink href="?step=9" variant="outline" size="sm">
              Continue to rules →
            </ButtonLink>
          </div>
        ) : null}

        {step === 9 ? (
          <Card>
            <CardHeader title="9. Rules, policies & FAQ" description="Starting text is provided — review and adapt it to your event and applicable laws." />
            <ActionForm action={save} className="space-y-5 p-5">
              {RULE_KEYS.map(([k, label]) => (
                <TextArea key={k} label={label} name={`rule_${k}`} defaultValue={((c.rules ?? {}) as Record<string, string>)[k] ?? ""} rows={3} />
              ))}
              <div className="border-t border-ink-100 pt-5">
                <p className="mb-2 text-sm font-bold">Competition FAQs</p>
                <FaqEditor name="faqs" initial={(c.faqs ?? []) as { q: string; a: string }[]} />
              </div>
              <div className="grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-3">
                <Checkbox
                  name="isPaid"
                  label="Charge a participation (entry) fee"
                  defaultChecked={c.isPaid}
                  className="sm:col-span-3"
                  hint="Participants pay your account directly by bank transfer and submit the transaction reference. You verify each payment on the Registrations tab; a registration is confirmed only after you verify it."
                />
                <TextInput
                  label="Fee per participant"
                  name="feeAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={c.feeAmountMinor ? c.feeAmountMinor / 100 : ""}
                />
                <TextInput label="Currency" name="currency" defaultValue={c.currency} maxLength={3} />
              </div>
              <fieldset className="grid gap-4 rounded-xl border border-ink-100 p-4 sm:grid-cols-2">
                <legend className="px-1 text-sm font-bold">Account participants pay into (required for a paid competition)</legend>
                <TextInput label="Account holder name" name="payeeAccountName" defaultValue={c.payeeAccountName ?? ""} autoComplete="off" />
                <TextInput label="Account number" name="payeeAccountNumber" defaultValue={c.payeeAccountNumber ?? ""} inputMode="numeric" autoComplete="off" />
                <TextInput label="IFSC code" name="payeeIfsc" defaultValue={c.payeeIfsc ?? ""} maxLength={11} autoComplete="off" />
                <TextInput label="Bank name" name="payeeBankName" defaultValue={c.payeeBankName ?? ""} autoComplete="off" />
                <TextInput label="Branch (optional)" name="payeeBranch" defaultValue={c.payeeBranch ?? ""} autoComplete="off" />
                <TextInput label="UPI ID (optional)" name="payeeUpiId" defaultValue={c.payeeUpiId ?? ""} placeholder="name@bank" autoComplete="off" />
                <p className="text-xs text-ink-500 sm:col-span-2">
                  Shown only to people who have registered for this competition, on their payment step — never on the public page.
                </p>
              </fieldset>
              <StepActions step={9} />
            </ActionForm>
          </Card>
        ) : null}

        {step === 10 ? (
          <PublishStep
            id={id}
            status={c.status}
            slug={c.slug}
            visibility={c.visibility}
            verified={base.organization.verified}
            canPublish={can("competition.publish")}
          />
        ) : null}
      </div>
    </div>
  );
}

async function PublishStep({
  id,
  status,
  slug,
  visibility,
  verified,
  canPublish,
}: {
  id: string;
  status: string;
  slug: string;
  visibility: string;
  verified: boolean;
  canPublish: boolean;
}) {
  const issues = status === "DRAFT" ? await getPublishIssues(id) : [];
  return (
    <Card>
      <CardHeader title="10. Review & publish" />
      <div className="space-y-6 p-5">
        <ActionForm action={setVisibilityAction.bind(null, id)} className="flex flex-wrap items-end gap-3">
          <Select
            label="Visibility"
            name="visibility"
            defaultValue={visibility}
            options={[
              { value: "PUBLIC", label: "Public — listed and searchable" },
              { value: "UNLISTED", label: "Unlisted — anyone with the link" },
              { value: "PRIVATE", label: "Private — not publicly viewable" },
            ]}
          />
          <SubmitButton variant="outline">Save visibility</SubmitButton>
        </ActionForm>
        {status !== "DRAFT" ? (
          <Alert tone="success">This competition is {status.toLowerCase().replace("_", " ")}.</Alert>
        ) : issues.length ? (
          <div>
            <p className="font-semibold">Before publishing:</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {issues.map((i) => (
                <li key={i} className="flex gap-2 text-ink-700">
                  <Icon name="close" className="mt-0.5 h-4 w-4 text-rose-500" />
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Alert tone="success" title="Everything required is in place." />
        )}
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/competitions/${slug}`} variant="outline">
            Preview event page
          </ButtonLink>
          {status === "DRAFT" && !issues.length && canPublish ? (
            <ConfirmAction
              action={publishAction.bind(null, id)}
              label={verified ? "Publish" : "Request approval"}
              variant="primary"
              confirmVariant="primary"
              size="md"
              title={verified ? "Publish this competition?" : "Request platform approval?"}
              confirmLabel={verified ? "Publish" : "Submit"}
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
