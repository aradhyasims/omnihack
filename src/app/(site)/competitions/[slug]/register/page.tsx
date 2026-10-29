import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/current";
import { getCompetitionPage } from "@/server/modules/competitions/queries";
import type { CustomField } from "@/server/modules/registrations/service";
import { eligibilitySummary, formatFee, REG_STATE_META, teamSummary } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { registerAction } from "@/app/(app)/dashboard/actions";

export const metadata: Metadata = { title: "Register", robots: { index: false } };

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/competitions/${slug}/register`)}`);
  const page = await getCompetitionPage(slug, user);
  if (!page) notFound();
  const { competition: c, registration, myRegistration } = page;
  if (myRegistration && myRegistration.status !== "WITHDRAWN") redirect(`/dashboard/competitions/${slug}`);
  const custom = (c.customFields ?? []) as CustomField[];
  const needsAge = c.minAge != null || c.maxAge != null;
  const rules = (c.rules ?? {}) as Record<string, string>;

  return (
    <div className="container-page max-w-3xl py-12">
      <Link href={`/competitions/${slug}`} className="text-sm font-semibold text-brand-600 hover:underline">
        ← {c.title}
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold">Register</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge>{eligibilitySummary(c.eligibilityTypes)}</Badge>
        <Badge>{teamSummary(c.participationMode, c.minTeamSize, c.maxTeamSize)}</Badge>
        <Badge>{formatFee(c.isPaid, c.feeAmountMinor, c.currency)}</Badge>
        <Badge tone="info">Closes {formatDateTime(c.registrationClosesAt, c.timezone)}</Badge>
      </div>

      {registration !== "OPEN" ? (
        <Alert tone="warning" title={REG_STATE_META[registration].label} className="mt-8">
          Registration is not available right now.
        </Alert>
      ) : !user.emailVerifiedAt ? (
        <Alert tone="warning" title="Verify your email first" className="mt-8">
          Use the link we emailed to {user.email}. You can resend it from your{" "}
          <Link className="underline" href="/dashboard">
            dashboard
          </Link>
          .
        </Alert>
      ) : (
        <ActionForm action={registerAction.bind(null, c.id, c.slug)} className="card mt-8 space-y-6 p-6 sm:p-8" refresh={false}>
          <p className="text-sm text-ink-600">
            Registering as <strong>{user.name}</strong> ({user.email}). We only ask for what this competition needs to check eligibility.
          </p>
          {c.isPaid && c.feeAmountMinor > 0 ? (
            <Alert tone="info" title={`Entry fee: ${formatFee(c.isPaid, c.feeAmountMinor, c.currency)}`}>
              After you register, your workspace shows the organizer&apos;s bank account. Pay by bank transfer and submit the transaction reference; your place
              is confirmed once the organizer verifies the payment.
            </Alert>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="I am a"
              name="participantType"
              required
              placeholder="Select…"
              options={[
                { value: "STUDENT", label: "Student" },
                { value: "PROFESSIONAL", label: "Working professional" },
                { value: "STARTUP", label: "Startup founder / team" },
                { value: "OTHER", label: "Other" },
              ]}
            />
            <TextInput
              label="Institution or organization"
              name="institution"
              required={Boolean(c.institutionRequirement)}
              hint={c.institutionRequirement ?? undefined}
            />
            {c.geoRestriction ? <TextInput label="Country" name="country" required hint={`Eligible: ${c.geoRestriction}`} /> : null}
            {needsAge ? (
              <TextInput
                label="Age"
                name="age"
                type="number"
                min={5}
                max={120}
                required
                hint={`Required: ${c.minAge ?? "any"}–${c.maxAge ?? "any"}. Used only to check eligibility.`}
              />
            ) : null}
          </div>
          {custom.length ? (
            <div className="space-y-5 border-t border-ink-100 pt-6">
              <h2 className="font-bold">Organizer questions</h2>
              {custom.map((f) =>
                f.type === "textarea" ? (
                  <TextArea key={f.key} label={f.label} name={`cf_${f.key}`} required={f.required} />
                ) : f.type === "select" ? (
                  <Select
                    key={f.key}
                    label={f.label}
                    name={`cf_${f.key}`}
                    required={f.required}
                    placeholder="Select…"
                    options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                  />
                ) : f.type === "checkbox" ? (
                  <Checkbox key={f.key} label={f.label} name={`cf_${f.key}`} />
                ) : (
                  <TextInput key={f.key} label={f.label} name={`cf_${f.key}`} required={f.required} />
                ),
              )}
            </div>
          ) : null}
          {c.requiredDocuments.length ? (
            <Alert tone="info" title="Documents you may be asked for">
              {c.requiredDocuments.join(", ")}. The organizer will tell you how to provide them.
            </Alert>
          ) : null}
          <div className="space-y-3 border-t border-ink-100 pt-6">
            <Checkbox
              name="acceptRules"
              label={
                <>
                  I have read and accept the{" "}
                  <Link href={`/competitions/${slug}#rules`} target="_blank" className="font-semibold text-brand-600 hover:underline">
                    competition rules
                  </Link>
                  , including originality and intellectual-property terms.
                </>
              }
            />
            {rules.mediaConsent ? (
              <Checkbox name="mediaConsent" label="I consent to photos or recordings of me being used by the organizer (optional)." />
            ) : null}
          </div>
          {c.requireRegistrationApproval ? (
            <p className="text-xs text-ink-500">The organizer reviews registrations manually; you'll be notified of the decision.</p>
          ) : null}
          <SubmitButton size="lg" pendingLabel="Registering…">
            Complete registration
          </SubmitButton>
        </ActionForm>
      )}
      <div className="mt-6">
        <ButtonLink href={`/competitions/${slug}`} variant="ghost">
          Back to competition
        </ButtonLink>
      </div>
    </div>
  );
}
