import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Icon, PageHeader } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { relativeFromNow } from "@/lib/time";
import { markAllReadAction } from "../actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unread} unread`}
        actions={unread ? <InlineAction action={markAllReadAction}>Mark all as read</InlineAction> : null}
      />
      {items.length ? (
        <ul className="card divide-y divide-ink-100">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? "px-5 py-4" : "bg-brand-50/40 px-5 py-4"}>
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`}
                  aria-label={n.readAt ? undefined : "Unread"}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-ink-600">{n.body}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-400">{relativeFromNow(n.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="You're all caught up"
          description="Updates about registrations, teams, stages and results will appear here."
          icon={<Icon name="bell" />}
        />
      )}
    </div>
  );
}
