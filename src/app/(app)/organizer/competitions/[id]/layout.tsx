import Link from "next/link";
import { TabNav } from "@/components/app/tabs";
import { Badge, DemoBadge } from "@/components/ui/primitives";
import { COMPETITION_STATUS_META, HOSTING_FEE_META, TYPE_LABEL } from "@/lib/labels";
import { loadManaged } from "./load";

export default async function ManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { competition: c, can } = await loadManaged(id);
  const tabs = [
    { href: "", label: "Overview", show: true },
    { href: "/edit", label: "Setup", show: can("competition.edit") },
    { href: "/stages", label: "Stages", show: can("stage.manage") },
    { href: "/registrations", label: "Registrations", show: can("registration.review") },
    { href: "/teams", label: "Teams & projects", show: can("team.manage") || can("submission.view_all") },
    { href: "/people", label: "People", show: can("staff.manage") || can("mentor.assign") },
    { href: "/mentors", label: "Mentors & judges", show: can("staff.manage") },
    { href: "/judging", label: "Judging", show: can("judge.assign") || can("evaluation.view_all") },
    { href: "/results", label: "Results", show: can("results.prepare") || can("evaluation.view_all") },
    { href: "/certificates", label: "Certificates", show: can("certificate.issue") },
    { href: "/operations", label: "Event ops", show: can("attendance.manage") || can("schedule.manage") },
    { href: "/analytics", label: "Analytics", show: can("analytics.view") },
    { href: "/showcase", label: "Showcase", show: can("showcase.moderate") },
    { href: "/sponsors", label: "Sponsors", show: can("sponsor.manage") || can("sponsor.report_view") },
    { href: "/hiring", label: "Hiring", show: can("hiring.manage") || can("talent.view") },
    { href: "/audit", label: "Audit log", show: can("audit.view") },
  ].filter((t) => t.show);
  const status = COMPETITION_STATUS_META[c.status];
  return (
    <div className="space-y-6">
      <div>
        <Link href="/organizer" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Organizer console
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{c.title}</h1>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          <Badge>{TYPE_LABEL[c.type]}</Badge>
          <Badge tone={HOSTING_FEE_META[c.hostingFeeStatus].tone}>{HOSTING_FEE_META[c.hostingFeeStatus].label}</Badge>
          {c.isDemo ? <DemoBadge /> : null}
        </div>
        <p className="mt-1 text-sm text-ink-500">
          {c.organization.name} ·{" "}
          <Link href={`/competitions/${c.slug}`} className="font-semibold text-brand-600 hover:underline">
            {c.status === "PUBLISHED" || c.status === "COMPLETED" ? "View public page" : "Preview page"}
          </Link>
        </p>
      </div>
      <TabNav base={`/organizer/competitions/${id}`} items={tabs} />
      <div>{children}</div>
    </div>
  );
}
