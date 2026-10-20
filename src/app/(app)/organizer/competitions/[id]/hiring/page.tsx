import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader, EmptyState, Icon, Stat } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm";
import { OPENING_TYPE_LABEL, WORK_MODE_LABEL } from "@/components/talent/opening-card";
import { actingCompany, hiringPipeline, managedOpenings, placementAnalytics, talentPool } from "@/server/modules/talent/service";
import { APPLICATION_STATUS_META } from "@/lib/labels";
import { formatDate, formatDateTime, utcToZonedLocal } from "@/lib/time";
import { advanceApplicationAction, deleteOpeningAction, hiringSettingsAction, openingAction, recruiterNoteAction, shortlistAction } from "../../../actions";
import { loadManaged } from "../load";

const TYPE_OPTIONS = Object.entries(OPENING_TYPE_LABEL).map(([value, label]) => ({ value, label }));
const MODE_OPTIONS = Object.entries(WORK_MODE_LABEL).map(([value, label]) => ({ value, label }));
const VIEWS = [
  { key: "pool", label: "Talent pool" },
  { key: "pipeline", label: "Pipeline" },
  { key: "openings", label: "Openings" },
  { key: "settings", label: "Settings" },
];

export default async function HiringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, competition: c, can } = await loadManaged(id);
  const canTalent = can("talent.view");
  const canManage = can("hiring.manage");
  if (!canTalent && !canManage) redirect(`/organizer/competitions/${id}`);
  const views = VIEWS.filter((v) => (v.key === "settings" || v.key === "openings" ? canManage : canTalent));
  const view = views.some((v) => v.key === sp.view) ? sp.view! : views[0].key;
  const company = await actingCompany(user, id).catch(() => null);
  const [stats, openings] = await Promise.all([placementAnalytics(user, id), canManage ? managedOpenings(user, id) : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      {!c.hiringEnabled ? (
        <Alert tone="warning" title="Hiring is switched off">
          Participants cannot join the talent pool and openings are hidden from the public until hiring is enabled in Settings.
        </Alert>
      ) : null}
      {company ? (
        <p className="text-sm text-ink-600">
          You are recruiting for <strong>{company}</strong>. You see only your company&apos;s openings and pipeline.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="In talent pool" value={stats.optedIn} hint={`${stats.optInRate}% of approved participants`} />
        <Stat label="Open positions" value={stats.positions} hint={`${stats.openings} opening${stats.openings === 1 ? "" : "s"}`} />
        <Stat label="Shortlisted" value={stats.shortlisted} />
        <Stat label="Interviews" value={stats.interviews} />
        <Stat label="Offers" value={stats.offers} />
        <Stat
          label="Accepted"
          value={stats.accepted}
          tone="success"
          hint={stats.medianDaysToAcceptedOffer != null ? `median ${stats.medianDaysToAcceptedOffer} days` : undefined}
        />
      </div>
      {stats.overdueResponses ? (
        <Alert tone="warning">
          {stats.overdueResponses} shortlisted candidate{stats.overdueResponses === 1 ? " has" : "s have"} waited more than {stats.slaDays} days without a next
          step. Please invite, offer or close the application — candidates are told they will hear back.
        </Alert>
      ) : null}

      <nav className="flex flex-wrap gap-1.5" aria-label="Hiring sections">
        {views.map((v) => (
          <Link
            key={v.key}
            href={`?view=${v.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${view === v.key ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-700 hover:border-ink-300"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "pool" ? <PoolView id={id} sp={sp} company={company} /> : null}
      {view === "pipeline" ? <PipelineView id={id} timeZone={c.timezone} /> : null}
      {view === "openings" ? <OpeningsView id={id} openings={openings} company={company} timeZone={c.timezone} /> : null}
      {view === "settings" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Hiring programme" description="Controls the talent pool and public openings for this competition." />
            <ActionForm action={hiringSettingsAction.bind(null, id)} className="space-y-3 p-5">
              <Checkbox name="hiringEnabled" defaultChecked={c.hiringEnabled} label="Enable hiring (talent pool opt-in and public openings)" />
              <Checkbox
                name="showRankBandToRecruiters"
                defaultChecked={c.showRankBandToRecruiters}
                label="Show recruiters a coarse rank band (Top 10% / 25% / 50%) after results are published"
                hint="Scores and judge comments are never shared."
              />
              <TextArea
                label="Note to participants"
                name="hiringNote"
                rows={3}
                defaultValue={c.hiringNote ?? ""}
                hint="Shown on the public page, e.g. which partners are hiring and how."
              />
              <SubmitButton>Save settings</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Recruiters" description="Company representatives get the Recruiter role on the People page." />
            <div className="space-y-2 p-5 text-sm text-ink-600">
              <p>Recruiters can post openings for their company, view consenting candidates, shortlist, invite to interview and make offers.</p>
              <p>They cannot see participants who did not opt in, judging scores, judge comments, or other companies&apos; pipelines.</p>
              {can("staff.manage") ? (
                <Link href={`/organizer/competitions/${id}/people`} className="font-semibold text-brand-600 hover:underline">
                  Add a recruiter →
                </Link>
              ) : null}
            </div>
          </Card>
          {stats.accepted ? (
            <Card>
              <CardHeader title="Placements" />
              <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
                <ul className="space-y-1">
                  {stats.acceptedByType
                    .filter((t) => t.count)
                    .map((t) => (
                      <li key={t.type}>
                        {OPENING_TYPE_LABEL[t.type]}: <strong>{t.count}</strong>
                      </li>
                    ))}
                </ul>
                <ul className="space-y-1">
                  {stats.byInstitution.map((r) => (
                    <li key={r.label}>
                      {r.label}: <strong>{r.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function PoolView({ id, sp, company }: { id: string; sp: Record<string, string | undefined>; company: string | null }) {
  const { user } = await loadManaged(id);
  const filters = { q: sp.q, type: sp.type, band: sp.band, status: sp.status };
  const [pool, openings] = await Promise.all([talentPool(user, id, filters), managedOpenings(user, id).catch(() => [])]);
  const openOpenings = openings.filter((o) => o.active);
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="view" value="pool" />
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Name, skill or institution"
          aria-label="Search candidates"
          className="h-9 rounded-lg border border-ink-200 px-3 text-sm"
        />
        <select name="type" defaultValue={sp.type ?? ""} aria-label="Interested in" className="h-9 rounded-lg border border-ink-200 px-2 text-sm">
          <option value="">Any opportunity</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="band" defaultValue={sp.band ?? ""} aria-label="Result" className="h-9 rounded-lg border border-ink-200 px-2 text-sm">
          <option value="">Any result</option>
          <option value="awarded">Award winners</option>
          <option value="Top 10%">Top 10%</option>
          <option value="Top 25%">Top 25%</option>
          <option value="Top 50%">Top 50%</option>
        </select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Pipeline status" className="h-9 rounded-lg border border-ink-200 px-2 text-sm">
          <option value="">Any status</option>
          <option value="none">Not yet contacted</option>
          {Object.entries(APPLICATION_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button className="h-9 rounded-lg bg-ink-900 px-3 text-sm font-semibold text-white">Filter</button>
      </form>
      <p className="text-xs text-ink-500">
        Only participants who opted in are listed. Rank bands and awards appear once results are officially published. Every profile view is recorded in the
        audit log.
      </p>
      {pool.length ? (
        <div className="card overflow-x-auto">
          <table className="table-om">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Project</th>
                <th>Looking for</th>
                <th>Status</th>
                <th className="min-w-[260px]">Shortlist</th>
              </tr>
            </thead>
            <tbody>
              {pool.map((r) => (
                <tr key={r.userId}>
                  <td>
                    <Link href={`/organizer/competitions/${id}/hiring/candidates/${r.userId}`} className="font-semibold text-ink-900 hover:underline">
                      {r.name}
                    </Link>
                    {r.headline ? <span className="block text-xs">{r.headline}</span> : null}
                    <span className="block text-xs">
                      {[r.institution, r.graduationYear ? `Class of ${r.graduationYear}` : null].filter(Boolean).join(" · ")}
                    </span>
                    {r.skills.length ? <span className="block text-xs text-ink-400">{r.skills.slice(0, 5).join(", ")}</span> : null}
                  </td>
                  <td className="text-xs">
                    {r.project ? (
                      <>
                        <span className="font-semibold text-ink-800">{r.project.title}</span>
                        {r.project.team ? <span className="block">Team {r.project.team}</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.rankBand ? <Badge tone="brand">{r.rankBand}</Badge> : null}
                      {r.awards.map((a) => (
                        <Badge key={a} tone="success">
                          {a}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className="text-xs">
                    {r.roleInterests.map((t) => OPENING_TYPE_LABEL[t]).join(", ")}
                    {r.preferredLocations.length ? <span className="block">{r.preferredLocations.join(", ")}</span> : null}
                    {r.availableFrom ? <span className="block">From {formatDate(r.availableFrom)}</span> : null}
                    {r.hasResume ? <span className="block text-emerald-700">CV available</span> : null}
                  </td>
                  <td>
                    {r.applications.length ? (
                      <span className="flex flex-col gap-1">
                        {r.applications.map((a) => (
                          <Badge key={a.id} tone={APPLICATION_STATUS_META[a.status].tone}>
                            {APPLICATION_STATUS_META[a.status].label}
                            {company ? "" : ` · ${a.company}`}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-400">Not contacted</span>
                    )}
                  </td>
                  <td>
                    <ActionForm action={shortlistAction.bind(null, id)} className="flex flex-wrap items-end gap-2" successMessage={false}>
                      <input type="hidden" name="userId" value={r.userId} />
                      {openOpenings.length ? (
                        <Select
                          label={<span className="sr-only">Opening</span>}
                          name="openingId"
                          placeholder={company ? "General interest" : "General (enter company)"}
                          options={openOpenings.map((o) => ({ value: o.id, label: company ? o.title : `${o.company} — ${o.title}` }))}
                        />
                      ) : null}
                      {company ? null : <TextInput label={<span className="sr-only">Company</span>} name="company" placeholder="Company (if general)" />}
                      <SubmitButton size="sm" variant="outline">
                        Shortlist
                      </SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No candidates match"
          description="Participants appear here after they opt into the talent pool from their competition workspace."
          icon={<Icon name="briefcase" />}
        />
      )}
    </div>
  );
}

async function PipelineView({ id, timeZone }: { id: string; timeZone: string }) {
  const { user } = await loadManaged(id);
  const apps = await hiringPipeline(user, id);
  if (!apps.length) {
    return (
      <EmptyState title="Pipeline is empty" description="Shortlist candidates from the talent pool to start a pipeline." icon={<Icon name="briefcase" />} />
    );
  }
  return (
    <div className="space-y-3">
      {apps.map((a) => {
        const meta = APPLICATION_STATUS_META[a.status];
        const closed = ["OFFER_ACCEPTED", "OFFER_DECLINED", "NOT_SELECTED", "WITHDRAWN"].includes(a.status);
        return (
          <article key={a.id} className="card p-5 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/organizer/competitions/${id}/hiring/candidates/${a.candidate.id}`} className="font-semibold text-ink-900 hover:underline">
                  {a.candidate.name}
                </Link>
                <span className="block text-xs text-ink-500">
                  {a.company} · {a.opening ? `${a.opening.title} (${OPENING_TYPE_LABEL[a.opening.type]})` : "General interest"} · updated{" "}
                  {formatDate(a.updatedAt)}
                </span>
              </div>
              <Badge tone={meta.tone} dot>
                {meta.label}
              </Badge>
            </div>
            {a.interviewAt || a.interviewDetails ? (
              <p className="mt-2 text-xs text-ink-600">
                Interview: {a.interviewAt ? formatDateTime(a.interviewAt, timeZone) : "time to be confirmed"}{" "}
                {a.interviewDetails ? `— ${a.interviewDetails}` : ""}
              </p>
            ) : null}
            {a.offerDetails ? <p className="mt-1 text-xs text-ink-600">Offer: {a.offerDetails}</p> : null}
            {a.candidateNote ? <p className="mt-1 text-xs text-ink-600">Candidate&apos;s message: “{a.candidateNote}”</p> : null}
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <ActionForm action={recruiterNoteAction.bind(null, a.id)} className="space-y-2">
                <TextArea label="Private hiring note" name="recruiterNote" rows={2} defaultValue={a.recruiterNote} hint="Never shown to the candidate." />
                <SubmitButton size="sm" variant="outline">
                  Save note
                </SubmitButton>
              </ActionForm>
              {closed ? null : (
                <div className="space-y-2">
                  {a.status === "SHORTLISTED" ? (
                    <details>
                      <summary className="cursor-pointer font-semibold text-brand-700">Invite to interview</summary>
                      <ActionForm action={advanceApplicationAction.bind(null, a.id)} className="mt-2 space-y-2">
                        <input type="hidden" name="action" value="INVITE_INTERVIEW" />
                        <TextInput label="Date & time" name="interviewAt" type="datetime-local" hint={`Competition time zone: ${timeZone}`} />
                        <TextArea label="Format, link or location" name="interviewDetails" rows={2} required />
                        <SubmitButton size="sm">Send invitation</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                  {a.status === "SHORTLISTED" || a.status === "INTERVIEW_ACCEPTED" ? (
                    <details>
                      <summary className="cursor-pointer font-semibold text-brand-700">Make an offer</summary>
                      <ActionForm action={advanceApplicationAction.bind(null, a.id)} className="mt-2 space-y-2">
                        <input type="hidden" name="action" value="MAKE_OFFER" />
                        <Select label="Offer type" name="offerType" defaultValue={a.opening?.type ?? ""} placeholder="Choose" options={TYPE_OPTIONS} />
                        <TextArea
                          label="Offer details"
                          name="offerDetails"
                          rows={3}
                          required
                          hint="Role, start date, duration, compensation. The formal letter is sent by your company."
                        />
                        <SubmitButton size="sm">Send offer</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer font-semibold text-ink-600">Close as not selected</summary>
                    <ActionForm action={advanceApplicationAction.bind(null, a.id)} className="mt-2 space-y-2">
                      <input type="hidden" name="action" value="NOT_SELECTED" />
                      <TextArea label="Message to the candidate (optional)" name="message" rows={2} />
                      <SubmitButton size="sm" variant="outline">
                        Send update
                      </SubmitButton>
                    </ActionForm>
                  </details>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

type Opening = Awaited<ReturnType<typeof managedOpenings>>[number];

function OpeningForm({ id, o, company, timeZone }: { id: string; o?: Opening; company: string | null; timeZone: string }) {
  return (
    <ActionForm action={openingAction.bind(null, id)} className="space-y-3" resetOnSuccess={!o}>
      {o ? <input type="hidden" name="id" value={o.id} /> : null}
      {company ? (
        <p className="text-sm text-ink-600">
          Company: <strong>{company}</strong>
        </p>
      ) : (
        <TextInput label="Company" name="company" required defaultValue={o?.company} />
      )}
      <TextInput label="Role title" name="title" required defaultValue={o?.title} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Type" name="type" defaultValue={o?.type ?? "INTERNSHIP"} options={TYPE_OPTIONS} />
        <Select label="Work mode" name="workMode" defaultValue={o?.workMode ?? "ONSITE"} options={MODE_OPTIONS} />
      </div>
      <TextInput label="Locations" name="locations" defaultValue={o?.locations.join(", ")} hint="Comma-separated" />
      <TextInput label="Skills" name="skills" defaultValue={o?.skills.join(", ")} hint="Comma-separated, e.g. python, react" />
      <TextArea label="Description" name="description" rows={3} defaultValue={o?.description} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Stipend / compensation" name="compensation" defaultValue={o?.compensation ?? ""} hint="Only publish figures the company confirmed." />
        <TextInput label="Duration" name="durationText" defaultValue={o?.durationText ?? ""} placeholder="e.g. 6 months" />
        <TextInput label="Positions" name="positions" type="number" min={1} max={500} defaultValue={o?.positions ?? 1} />
        <TextInput label="Applications close" name="closesAt" type="datetime-local" defaultValue={utcToZonedLocal(o?.closesAt, timeZone)} />
      </div>
      <Checkbox name="active" defaultChecked={o?.active ?? true} label="Active (listed publicly while hiring is enabled)" />
      <SubmitButton size="sm">{o ? "Save opening" : "Publish opening"}</SubmitButton>
    </ActionForm>
  );
}

function OpeningsView({ id, openings, company, timeZone }: { id: string; openings: Opening[]; company: string | null; timeZone: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Openings" description="Internships, pre-placement offers and jobs linked to this competition." />
        <ul className="divide-y divide-ink-100">
          {openings.map((o) => (
            <li key={o.id} className="space-y-2 px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{o.title}</span>
                <span className="text-ink-500">· {o.company}</span>
                <Badge>{OPENING_TYPE_LABEL[o.type]}</Badge>
                <Badge tone={o.active ? "success" : "neutral"}>{o.active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-xs text-ink-500">
                {WORK_MODE_LABEL[o.workMode]}
                {o.locations.length ? ` · ${o.locations.join(", ")}` : ""} · {o.positions} position{o.positions === 1 ? "" : "s"} · {o._count.applications} in
                pipeline
                {o.closesAt ? ` · closes ${formatDate(o.closesAt)}` : ""}
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <details className="flex-1">
                  <summary className="cursor-pointer font-semibold text-brand-700">Edit</summary>
                  <div className="mt-3">
                    <OpeningForm id={id} o={o} company={company} timeZone={timeZone} />
                  </div>
                </details>
                <ConfirmAction
                  action={deleteOpeningAction.bind(null, o.id)}
                  label={o._count.applications ? "Close" : "Delete"}
                  variant="ghost"
                  title={o._count.applications ? `Close ${o.title}?` : `Delete ${o.title}?`}
                  description={o._count.applications ? "It has candidates in the pipeline, so it will be deactivated rather than deleted." : undefined}
                  confirmLabel={o._count.applications ? "Close opening" : "Delete"}
                />
              </div>
            </li>
          ))}
          {openings.length === 0 ? <li className="px-5 py-6 text-sm text-ink-500">No openings yet.</li> : null}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Post an opening" />
        <div className="p-5">
          <OpeningForm id={id} company={company} timeZone={timeZone} />
        </div>
      </Card>
    </div>
  );
}
