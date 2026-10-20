import { redirect } from "next/navigation";
import { Alert, Badge, Card, CardHeader, Stat } from "@/components/ui/primitives";
import { BarChart, HBarList } from "@/components/charts/bar-chart";
import { competitionAnalytics } from "@/server/modules/analytics/service";
import { db } from "@/server/db";
import { CERT_LABEL, STAGE_STATUS_META } from "@/lib/labels";
import { loadManaged } from "../load";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, competition, can } = await loadManaged(id);
  if (!can("analytics.view")) redirect(`/organizer/competitions/${id}`);
  const from = sp.from ? new Date(`${sp.from}T00:00:00Z`) : null;
  const to = sp.to ? new Date(`${sp.to}T23:59:59Z`) : null;
  const a = await competitionAnalytics(user, id, { from, to, trackId: sp.track || null, stageId: sp.stage || null });
  const stages = await db.stage.findMany({ where: { competitionId: id, enabled: true }, orderBy: { order: "asc" }, select: { id: true, name: true } });
  const exports = ["registrations", "teams", "submissions", "rankings", "attendance"];
  return (
    <div className="space-y-6">
      {competition.isDemo ? (
        <Alert tone="warning" title="Demo data">
          This competition contains seeded demonstration data, not real activity.
        </Alert>
      ) : null}
      <form className="card flex flex-wrap items-end gap-3 p-4" aria-label="Analytics filters">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">From</span>
          <input type="date" name="from" defaultValue={sp.from} className="h-9 rounded-lg border border-ink-200 px-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">To</span>
          <input type="date" name="to" defaultValue={sp.to} className="h-9 rounded-lg border border-ink-200 px-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Track</span>
          <select name="track" defaultValue={sp.track ?? ""} className="h-9 rounded-lg border border-ink-200 px-2">
            <option value="">All tracks</option>
            {a.competition.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Stage</span>
          <select name="stage" defaultValue={sp.stage ?? ""} className="h-9 rounded-lg border border-ink-200 px-2">
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="h-9 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white">Apply</button>
        <span className="ml-auto flex flex-wrap gap-3 text-sm">
          {exports.map((k) => (
            <a key={k} href={`/api/v1/organizer/competitions/${id}/export/${k}`} className="font-semibold text-brand-600 hover:underline">
              {k} CSV
            </a>
          ))}
        </span>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registrations" value={a.registrations.total} hint={`${a.registrations.approved} approved · ${a.registrations.pending} pending`} />
        <Stat label="Eligible participants" value={a.registrations.eligible} />
        <Stat label="Teams" value={a.teams.count} hint={`avg ${a.teams.avgSize} members · ${a.teams.soloProjects} solo`} />
        <Stat label="Attendance" value={`${a.attendance.rate}%`} hint={`${a.attendance.checkedIn} checked in`} />
        <Stat label="Active projects" value={a.teams.activeProjects} />
        <Stat label="Winners" value={a.winners} />
        <Stat label="Certificates" value={a.certificates.reduce((s, c) => s + c.count, 0)} />
        <Stat
          label="Notification read rate"
          value={a.engagement.readRate == null ? "—" : `${a.engagement.readRate}%`}
          hint={`${a.engagement.notifications} sent`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Registrations per day" description="UTC days, all statuses" />
          <div className="p-5">
            <BarChart
              title="Registrations per day"
              data={a.registrations.series.map((s) => ({ label: s.day.slice(5), value: s.count }))}
              valueLabel="Registrations"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Participant types" />
          <div className="p-5">
            <HBarList data={a.registrations.byType.map((t) => ({ label: t.label.toLowerCase(), value: t.count }))} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Stage progression" description="Submission, evaluation and advancement per stage" />
        <div className="overflow-x-auto">
          <table className="table-om">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Status</th>
                <th className="text-right">Submitted</th>
                <th className="text-right">Drafts</th>
                <th className="text-right">Evaluations</th>
                <th className="text-right">Decided</th>
                <th className="text-right">Advanced</th>
              </tr>
            </thead>
            <tbody>
              {a.stages.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold text-ink-900">{s.name}</td>
                  <td>
                    <Badge tone={STAGE_STATUS_META[s.status].tone}>{STAGE_STATUS_META[s.status].label}</Badge>
                  </td>
                  <td className="text-right tabular-nums">{s.acceptsSubmissions ? s.submitted : "—"}</td>
                  <td className="text-right tabular-nums">{s.acceptsSubmissions ? s.drafts : "—"}</td>
                  <td className="text-right tabular-nums">{s.isJudged ? `${s.finalized}/${s.assignments}` : "—"}</td>
                  <td className="text-right tabular-nums">{s.isJudged ? s.decided : "—"}</td>
                  <td className="text-right tabular-nums">{s.isJudged ? s.advanced : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Institutions & organizations represented" description="Top 10" />
          <div className="p-5">
            <HBarList data={a.institutions.map((i) => ({ label: i.label, value: i.count }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Certificates issued" />
          <div className="p-5">
            <HBarList data={a.certificates.map((c) => ({ label: CERT_LABEL[c.label], value: c.count }))} />
          </div>
        </Card>
      </div>
    </div>
  );
}
