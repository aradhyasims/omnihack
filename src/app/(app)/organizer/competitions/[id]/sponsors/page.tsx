import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader, Stat } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { sponsorWorkspace } from "@/server/modules/sponsors/service";
import { addSponsorAction, prizeSponsorAction, removeSponsorAction, sponsorConfirmedAction } from "../../../actions";
import { loadManaged } from "../load";

export default async function SponsorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, can } = await loadManaged(id);
  if (!can("sponsor.manage") && !can("sponsor.report_view")) redirect(`/organizer/competitions/${id}`);
  const w = await sponsorWorkspace(user, id);
  const r = w.report;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Sponsor report" description="Aggregate figures only — no participant personal data is shared with sponsors." />
        <div className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Registrations" value={r.registrations} hint={`${r.approved} approved`} />
          <Stat label="Institutions" value={r.institutions} />
          <Stat label="Teams" value={r.teams} />
          <Stat label="Projects" value={r.projects} />
          <Stat label="Submissions" value={r.submissions} />
          <Stat label="Checked in" value={r.attendance} />
        </div>
        <div className="border-t border-ink-100 px-5 py-4 text-sm">
          {r.resultsPublished ? (
            r.sponsoredWinners.length ? (
              <ul className="space-y-1">
                {r.sponsoredWinners.map((s, i) => (
                  <li key={i}>
                    <strong>{s.prize.title}</strong>: {s.project.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-500">No sponsor awards were assigned.</p>
            )
          ) : (
            <p className="text-ink-500">Sponsor award winners appear here once results are published.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Sponsors" description="Only confirmed sponsors are shown on the public competition page." />
          <ul className="divide-y divide-ink-100">
            {w.links.map((l) => (
              <li key={l.id} className="space-y-2 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{l.sponsor.name}</span>
                  <Badge>{l.tier}</Badge>
                  <Badge tone={l.confirmed ? "success" : "warning"}>{l.confirmed ? "Confirmed — public" : "Unconfirmed — hidden"}</Badge>
                </div>
                {l.benefits ? <p className="text-ink-600">Benefits: {l.benefits}</p> : null}
                {w.canManage && (l.sponsor.contactName || l.sponsor.contactEmail) ? (
                  <p className="text-xs text-ink-500">
                    Contact: {l.sponsor.contactName} {l.sponsor.contactEmail}
                  </p>
                ) : null}
                {w.canManage ? (
                  <div className="flex gap-2">
                    <InlineAction action={sponsorConfirmedAction.bind(null, l.id, !l.confirmed)}>
                      {l.confirmed ? "Mark unconfirmed" : "Confirm relationship"}
                    </InlineAction>
                    <ConfirmAction
                      action={removeSponsorAction.bind(null, l.id)}
                      label="Remove"
                      variant="ghost"
                      title={`Remove ${l.sponsor.name}?`}
                      confirmLabel="Remove"
                    />
                  </div>
                ) : null}
              </li>
            ))}
            {w.links.length === 0 ? <li className="px-5 py-6 text-sm text-ink-500">No sponsors yet.</li> : null}
          </ul>
        </Card>
        {w.canManage ? (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Add a sponsor" />
              <ActionForm action={addSponsorAction.bind(null, id)} resetOnSuccess className="space-y-3 p-5">
                <TextInput label="Name" name="name" required />
                <TextInput label="Tier" name="tier" required defaultValue="Partner" />
                <TextInput label="Website" name="website" type="url" />
                <TextArea label="Description" name="description" rows={2} />
                <TextArea label="Agreed benefits / branding placements" name="benefits" rows={2} />
                <TextInput label="Contact name" name="contactName" />
                <TextInput label="Contact email" name="contactEmail" type="email" />
                <Checkbox name="confirmed" label="The sponsorship is confirmed in writing" />
                <SubmitButton>Save sponsor</SubmitButton>
              </ActionForm>
            </Card>
            {w.prizes.length && w.links.length ? (
              <Card>
                <CardHeader title="Sponsor awards" description="Attribute prizes to a sponsor." />
                <div className="space-y-3 p-5">
                  {w.prizes.map((p) => (
                    <ActionForm key={p.id} action={prizeSponsorAction.bind(null, p.id)} className="flex flex-wrap items-end gap-2" successMessage={false}>
                      <Select
                        label={p.title}
                        name="sponsorId"
                        defaultValue={p.sponsorId ?? ""}
                        placeholder="No sponsor"
                        options={w.links.map((l) => ({ value: l.sponsorId, label: l.sponsor.name }))}
                      />
                      <SubmitButton size="sm" variant="outline">
                        Save
                      </SubmitButton>
                    </ActionForm>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        ) : (
          <Alert tone="info">You have read-only sponsor access.</Alert>
        )}
      </div>
    </div>
  );
}
