import { redirect } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { db } from "@/server/db";
import { addStaffAction, assignMentorAction, removeStaffAction, unassignMentorAction } from "../../../actions";
import { loadManaged } from "../load";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Competition owner",
  OPS_COORDINATOR: "Event operations coordinator",
  JUDGE: "Judge",
  MENTOR: "Mentor",
  SPONSOR_REP: "Sponsor representative",
  AUDITOR: "Read-only auditor",
  VOLUNTEER: "Volunteer",
  RECRUITER: "Recruiter (hiring partner)",
};

export default async function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { can } = await loadManaged(id);
  if (!can("staff.manage") && !can("mentor.assign")) redirect(`/organizer/competitions/${id}`);
  const [members, projects, mentorAssignments] = await Promise.all([
    db.competitionMember.findMany({
      where: { competitionId: id, status: "ACTIVE" },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.project.findMany({ where: { competitionId: id, status: "ACTIVE" }, select: { id: true, title: true, team: { select: { name: true } } } }),
    db.mentorAssignment.findMany({ where: { competitionId: id }, include: { project: { select: { title: true } } } }),
  ]);
  const mentors = members.filter((m) => m.role === "MENTOR");
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader title="Staff, judges & mentors" description="Event-specific roles. A person can hold different roles in different competitions." />
        <ul className="divide-y divide-ink-100">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{m.user.name}</p>
                <p className="truncate text-xs text-ink-500">
                  {m.user.email}
                  {m.company ? ` · ${m.company}` : ""}
                  {m.expertise ? ` · ${m.expertise}` : ""}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
              </div>
              <Badge tone={m.role === "JUDGE" ? "brand" : m.role === "MENTOR" ? "info" : m.role === "RECRUITER" ? "success" : "neutral"}>
                {ROLE_LABEL[m.role]}
              </Badge>
              {m.showPublicly ? <Badge tone="success">Public</Badge> : null}
              {can("staff.manage") ? (
                <ConfirmAction
                  action={removeStaffAction.bind(null, id, m.id)}
                  label="Remove"
                  variant="ghost"
                  title={`Remove ${m.user.name} as ${ROLE_LABEL[m.role].toLowerCase()}?`}
                  description={m.role === "JUDGE" ? "Their unfinished evaluations will be revoked; finalized evaluations are kept." : undefined}
                  confirmLabel="Remove"
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-6">
        {can("staff.manage") ? (
          <Card>
            <CardHeader title="Add a person" description="They need an OmniHack account. They'll be notified by email." />
            <ActionForm action={addStaffAction.bind(null, id)} resetOnSuccess className="space-y-4 p-5">
              <TextInput label="Email" name="email" type="email" required />
              <Select label="Role" name="role" defaultValue="JUDGE" options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />
              <TextInput label="Company" name="company" hint="Required for recruiters — they act only for this company" />
              <TextInput label="Expertise" name="expertise" hint="Shown on the public page if enabled" />
              <TextInput label="Duty / note" name="note" hint="e.g. Registration desk, Hall A (volunteers)" />
              <Checkbox name="showPublicly" label="Show on the public competition page (judges & mentors)" />
              <SubmitButton>Add person</SubmitButton>
            </ActionForm>
          </Card>
        ) : null}
        {can("mentor.assign") ? (
          <Card>
            <CardHeader title="Mentor assignments" />
            <div className="space-y-4 p-5">
              {mentors.length && projects.length ? (
                <ActionForm action={assignMentorAction.bind(null, id)} className="space-y-3">
                  <Select label="Mentor" name="mentorId" options={mentors.map((m) => ({ value: m.userId, label: m.user.name }))} />
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-semibold">Projects</legend>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-ink-100 p-2">
                      {projects.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="projectIds" value={p.id} className="accent-brand-600" /> {p.title}
                          {p.team ? <span className="text-xs text-ink-400">({p.team.name})</span> : null}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <SubmitButton size="sm">Assign</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-sm text-ink-500">Add mentors and wait for projects to be created to assign them.</p>
              )}
              {mentorAssignments.length ? (
                <ul className="space-y-1 border-t border-ink-100 pt-3 text-sm">
                  {mentorAssignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span>
                        {members.find((m) => m.userId === a.mentorId)?.user.name ?? "Mentor"} → {a.project.title}
                      </span>
                      <InlineAction action={unassignMentorAction.bind(null, a.id)} variant="ghost">
                        Unassign
                      </InlineAction>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
