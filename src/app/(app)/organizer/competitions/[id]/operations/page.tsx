import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader, Stat } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { CheckInPanel } from "@/components/organizer/check-in";
import { db } from "@/server/db";
import { operationsDashboard } from "@/server/modules/operations/service";
import { formatDateTime } from "@/lib/time";
import {
  announcementAction,
  checkInAction,
  deleteAnnouncementAction,
  deleteSessionAction,
  manualCheckInAction,
  sessionAction,
  slotsAction,
  supportReplyAction,
  undoCheckInAction,
} from "../../../actions";
import { loadManaged } from "../load";

const KINDS = ["KICKOFF", "WORKSHOP", "MENTOR_SESSION", "PRESENTATION", "CHECKPOINT", "CEREMONY", "OTHER"].map((v) => ({
  value: v,
  label: v.replace("_", " ").toLowerCase(),
}));

export default async function OperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, can } = await loadManaged(id);
  if (!can("attendance.manage") && !can("schedule.manage")) redirect(`/organizer/competitions/${id}`);
  const d = await operationsDashboard(user, id);
  const tz = d.competition.timezone;
  const [announcements, approvedRegs, judgedStages] = await Promise.all([
    db.announcement.findMany({ where: { competitionId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    can("attendance.override")
      ? db.registration.findMany({
          where: { competitionId: id, status: "APPROVED" },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    db.stage.findMany({ where: { competitionId: id, enabled: true, isJudged: true }, orderBy: { order: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Checked in" value={`${d.checkedIn} / ${d.approved}`} hint="Approved participants" />
        <Stat label="Upcoming sessions" value={d.upcoming.length} />
        <Stat label="Open support requests" value={d.support.length} tone={d.support.length ? "warning" : undefined} />
        <Stat label="Volunteers" value={d.volunteers.length} />
      </div>
      {d.alerts.length ? (
        <div className="space-y-2">
          {d.alerts.map((a) => (
            <Alert key={a.text} tone={a.level === "warn" ? "warning" : "info"}>
              {a.text}
            </Alert>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {can("attendance.manage") ? (
          <Card>
            <CardHeader title="Check-in desk" />
            <div className="space-y-6 p-5">
              <CheckInPanel action={checkInAction.bind(null, id)} sessions={d.sessions.map((s) => ({ id: s.id, title: s.title }))} />
              {can("attendance.override") && approvedRegs.length ? (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-ink-700">Manual override (authorized)</summary>
                  <ActionForm action={manualCheckInAction.bind(null, id)} resetOnSuccess className="mt-3 space-y-3">
                    <Select label="Participant" name="userId" options={approvedRegs.map((r) => ({ value: r.userId, label: r.user.name }))} />
                    <TextInput label="Reason" name="reason" required placeholder="e.g. Forgot phone, ID verified" />
                    <SubmitButton size="sm" variant="outline">
                      Check in manually
                    </SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
              <div>
                <p className="mb-2 text-sm font-semibold">Recent check-ins</p>
                <ul className="space-y-1 text-sm">
                  {d.recentAttendance.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span>
                        {a.name} <Badge>{a.method.toLowerCase()}</Badge>{" "}
                        <span className="text-xs text-ink-400">{formatDateTime(a.checkedInAt, tz, false)}</span>
                      </span>
                      {can("attendance.override") ? (
                        <InlineAction action={undoCheckInAction.bind(null, a.id)} variant="ghost">
                          Undo
                        </InlineAction>
                      ) : null}
                    </li>
                  ))}
                  {d.recentAttendance.length === 0 ? <li className="text-ink-500">No check-ins yet.</li> : null}
                </ul>
                <a
                  href={`/api/v1/organizer/competitions/${id}/export/attendance`}
                  className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline"
                >
                  Export attendance CSV
                </a>
              </div>
            </div>
          </Card>
        ) : null}

        {can("announcement.create") ? (
          <Card>
            <CardHeader title="Announcements" />
            <div className="space-y-5 p-5">
              <ActionForm action={announcementAction.bind(null, id)} resetOnSuccess className="space-y-3">
                <TextInput label="Title" name="title" required />
                <TextArea label="Message" name="body" required rows={3} />
                <Select
                  label="Audience"
                  name="audience"
                  options={[
                    { value: "ALL", label: "Everyone" },
                    { value: "PARTICIPANTS", label: "Participants" },
                    { value: "JUDGES", label: "Judges" },
                    { value: "MENTORS", label: "Mentors" },
                    { value: "STAFF", label: "Staff & volunteers" },
                  ]}
                />
                <div className="flex flex-wrap gap-4">
                  <Checkbox name="pinned" label="Pin" />
                  <Checkbox name="sendEmail" label="Also send by email" />
                </div>
                <SubmitButton>Post announcement</SubmitButton>
              </ActionForm>
              <ul className="space-y-3 border-t border-ink-100 pt-4 text-sm">
                {announcements.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="font-semibold">{a.title}</span> <Badge>{a.audience.toLowerCase()}</Badge>
                      <span className="block text-xs text-ink-500">{formatDateTime(a.createdAt, tz)}</span>
                    </span>
                    <ConfirmAction
                      action={deleteAnnouncementAction.bind(null, a.id)}
                      label="Delete"
                      variant="ghost"
                      title="Delete this announcement?"
                      confirmLabel="Delete"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ) : null}
      </div>

      {can("schedule.manage") ? (
        <Card>
          <CardHeader title="Schedule & sessions" description={`Times in ${tz}. Use external meeting links for online sessions.`} />
          <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
              {d.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-semibold">{s.title}</span> <Badge>{s.kind.replace("_", " ").toLowerCase()}</Badge>
                    <span className="block text-xs text-ink-500">
                      {formatDateTime(s.startsAt, tz)} – {formatDateTime(s.endsAt, tz, false)}
                      {s.location ? ` · ${s.location}` : ""}
                      {s.hostName ? ` · ${s.hostName}` : ""} · {s._count.attendance} attended
                    </span>
                  </span>
                  <ConfirmAction
                    action={deleteSessionAction.bind(null, id, s.id)}
                    label="Delete"
                    variant="ghost"
                    title={`Delete "${s.title}"?`}
                    confirmLabel="Delete"
                  />
                </li>
              ))}
              {d.sessions.length === 0 ? <li className="px-4 py-6 text-center text-ink-500">No sessions yet.</li> : null}
            </ul>
            <ActionForm action={sessionAction.bind(null, id)} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Title" name="title" required className="sm:col-span-2" />
              <Select label="Kind" name="kind" options={KINDS} />
              <TextInput label="Host" name="hostName" />
              <TextInput label="Starts" name="startsAt" type="datetime-local" required />
              <TextInput label="Ends" name="endsAt" type="datetime-local" required />
              <TextInput label="Room / location" name="location" />
              <TextInput label="Meeting link" name="meetingUrl" type="url" />
              <div className="sm:col-span-2">
                <SubmitButton size="sm">Add session</SubmitButton>
              </div>
            </ActionForm>
          </div>
          {judgedStages.length ? (
            <div className="border-t border-ink-100 p-5">
              <p className="mb-3 text-sm font-bold">Presentation slots</p>
              <ActionForm
                action={slotsAction.bind(null, (judgedStages.find((s) => s.status !== "COMPLETED") ?? judgedStages[0]).id)}
                className="flex flex-wrap items-end gap-3"
              >
                <TextInput label="First slot starts" name="startsAt" type="datetime-local" required />
                <TextInput label="Minutes per team" name="minutes" type="number" defaultValue={10} />
                <TextInput label="Room" name="room" />
                <SubmitButton size="sm" variant="outline">
                  Allocate for “{(judgedStages.find((s) => s.status !== "COMPLETED") ?? judgedStages[0]).name}”
                </SubmitButton>
              </ActionForm>
            </div>
          ) : null}
        </Card>
      ) : null}

      {can("support.respond") ? (
        <Card>
          <CardHeader title="Support requests" />
          <ul className="divide-y divide-ink-100">
            {d.support.map((r) => (
              <li key={r.id} className="space-y-2 px-5 py-4 text-sm">
                <p>
                  <span className="font-semibold">{r.subject}</span> <Badge tone="warning">{r.status.toLowerCase().replace("_", " ")}</Badge>
                  <span className="block text-xs text-ink-500">
                    {r.user.name} · {r.user.email} · {formatDateTime(r.createdAt, tz)}
                  </span>
                </p>
                <p className="whitespace-pre-line text-ink-700">{r.body}</p>
                <ActionForm action={supportReplyAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                  <TextInput label={<span className="sr-only">Reply</span>} name="response" placeholder="Reply" required className="min-w-[240px] flex-1" />
                  <Select
                    label={<span className="sr-only">Status</span>}
                    name="status"
                    options={[
                      { value: "RESOLVED", label: "Resolve" },
                      { value: "IN_PROGRESS", label: "In progress" },
                    ]}
                  />
                  <SubmitButton size="sm" variant="outline">
                    Send
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
            {d.support.length === 0 ? <li className="px-5 py-6 text-sm text-ink-500">No open requests.</li> : null}
          </ul>
        </Card>
      ) : null}

      {d.volunteers.length ? (
        <Card>
          <CardHeader title="Volunteer assignments" />
          <ul className="divide-y divide-ink-100 text-sm">
            {d.volunteers.map((v) => (
              <li key={v.id} className="px-5 py-3">
                <span className="font-semibold">{v.user.name}</span> <span className="text-ink-500">· {v.note ?? "No duty assigned"}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
