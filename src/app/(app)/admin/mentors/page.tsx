import { Badge, Card, EmptyState, Icon } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { listMentorApplications, mentorDomainOptions } from "@/server/modules/admin/service";
import { formatDateTime } from "@/lib/time";
import { mentorApplicationStatusAction } from "../actions";

export default async function MentorApplicationsPage() {
  const admin = await requireAdminUser();
  const [items, { labels }] = await Promise.all([listMentorApplications(admin), mentorDomainOptions()]);
  if (!items.length)
    return <EmptyState title="No mentor registrations" description="Registrations from the homepage appear here." icon={<Icon name="mentor" />} />;
  return (
    <div className="space-y-3">
      {items.map((m) => (
        <Card key={m.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {m.photoKey ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded media served by /media
                <img src={`/media/${m.photoKey}`} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-ink-200" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-100 text-ink-400">
                  <Icon name="users" className="h-4 w-4" />
                </span>
              )}
              <p className="font-semibold">
                {m.name}{" "}
                <span className="text-sm font-normal text-ink-500">
                  · {m.email}
                  {m.mobile ? (
                    <>
                      {" · "}
                      <a href={`tel:${m.mobile}`} className="hover:underline">
                        {m.mobile}
                      </a>
                    </>
                  ) : null}
                </span>
              </p>
            </div>
            <Badge tone={m.status === "NEW" ? "warning" : m.status === "APPROVED" ? "success" : "neutral"}>{m.status.toLowerCase()}</Badge>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Designation", m.designation],
              ["Qualification", m.qualification],
              ["Location", `${m.city}, ${m.country}`],
              ["Domains", m.domains.map((d) => labels[d] ?? d).join(", ") || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase text-ink-500">{k}</dt>
                <dd className="text-ink-800">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs font-semibold uppercase text-ink-500">LinkedIn</dt>
              <dd>
                <a
                  href={m.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                >
                  View profile <Icon name="external" className="h-3.5 w-3.5" />
                </a>
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
            {formatDateTime(m.createdAt)}
            {m.status !== "APPROVED" ? (
              <InlineAction action={mentorApplicationStatusAction.bind(null, m.id, "APPROVED")} variant="ghost">
                Approve
              </InlineAction>
            ) : null}
            {m.status !== "DECLINED" ? (
              <InlineAction action={mentorApplicationStatusAction.bind(null, m.id, "DECLINED")} variant="ghost">
                Decline
              </InlineAction>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
