import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, Icon, PageHeader, Stat } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth/current";
import { myAssignments } from "@/server/modules/judging/service";
import { STAGE_STATUS_META } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Judging" };

const STATUS: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  ASSIGNED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "Draft saved", tone: "warning" },
  SUBMITTED: { label: "Finalized", tone: "success" },
  CONFLICT_DECLARED: { label: "Conflict declared", tone: "danger" },
};

export default async function JudgingPage() {
  const user = await requireUser("/dashboard/judging");
  const rows = await myAssignments(user);
  const pending = rows.filter((r) => r.status === "ASSIGNED" || r.status === "IN_PROGRESS");
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.stage.competition.title} — ${r.stage.name}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Judge dashboard" title="Your evaluations" description="Only projects assigned to you are shown. Scores lock when you finalize." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Assigned" value={rows.length} />
        <Stat label="Pending" value={pending.length} tone={pending.length ? "warning" : undefined} />
        <Stat label="Finalized" value={rows.filter((r) => r.status === "SUBMITTED").length} tone="success" />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No assignments yet" description="When an organizer assigns projects to you, they'll appear here." icon={<Icon name="gavel" />} />
      ) : (
        [...groups.entries()].map(([title, list]) => {
          const stage = list[0].stage;
          return (
            <section key={title} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
                <div>
                  <h2 className="font-bold">{title}</h2>
                  <p className="text-xs text-ink-500">Deadline: {formatDateTime(list[0].dueAt ?? stage.endsAt, stage.competition.timezone)}</p>
                </div>
                <Badge tone={STAGE_STATUS_META[stage.status].tone}>{stage.status === "JUDGING" ? "Judging open" : STAGE_STATUS_META[stage.status].label}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="table-om">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Challenge</th>
                      <th>Status</th>
                      <th className="text-right">Score</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id}>
                        <td className="font-semibold text-ink-900">{a.project.title}</td>
                        <td>{a.project.challenge?.title ?? "—"}</td>
                        <td>
                          <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                        </td>
                        <td className="text-right tabular-nums">{a.evaluation?.totalScore ?? "—"}</td>
                        <td className="text-right">
                          <Link href={`/dashboard/judging/${a.id}`} className="font-semibold text-brand-600 hover:underline">
                            {a.status === "SUBMITTED" || a.status === "CONFLICT_DECLARED" ? "View" : "Evaluate"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
