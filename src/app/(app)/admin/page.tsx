import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, Stat } from "@/components/ui/primitives";
import { requireAdminUser } from "@/server/auth/current";
import { adminOverview } from "@/server/modules/admin/service";
import { COMPETITION_STATUS_META } from "@/lib/labels";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminHome() {
  const user = await requireAdminUser();
  const o = await adminOverview(user);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={o.users} />
        <Stat label="Organizations" value={o.orgs} />
        <Stat
          label="Awaiting approval"
          value={
            <Link href="/admin/approvals" className="hover:underline">
              {o.pending}
            </Link>
          }
          tone={o.pending ? "warning" : undefined}
        />
        <Stat
          label="New inquiries"
          value={
            <Link href="/admin/inquiries" className="hover:underline">
              {o.inquiries}
            </Link>
          }
        />
        <Stat
          label="New mentor registrations"
          value={
            <Link href="/admin/mentors" className="hover:underline">
              {o.mentorApplications}
            </Link>
          }
        />
        <Stat label="Queued jobs" value={o.queuedJobs} />
        <Stat label="Failed jobs" value={o.failedJobs} tone={o.failedJobs ? "warning" : undefined} />
        <Stat
          label="Failed emails"
          value={
            <Link href="/admin/system" className="hover:underline">
              {o.failedEmails}
            </Link>
          }
          tone={o.failedEmails ? "warning" : undefined}
        />
      </div>
      <Card>
        <CardHeader title="Competitions by status" />
        <ul className="grid gap-px bg-ink-100 sm:grid-cols-3">
          {o.competitions.map((c) => (
            <li key={c.status} className="bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase text-ink-500">{COMPETITION_STATUS_META[c.status].label}</p>
              <p className="font-display text-2xl font-extrabold">{c._count._all}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
