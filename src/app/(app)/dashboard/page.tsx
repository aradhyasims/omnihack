import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, CardHeader, EmptyState, Icon, PageHeader, Stat } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { BannerArt } from "@/components/brand/banner-art";
import { requireUser } from "@/server/auth/current";
import { dashboardOverview } from "@/server/modules/participants/service";
import { REGISTRATION_STATUS_META, TYPE_LABEL } from "@/lib/labels";
import { formatDate, relativeFromNow } from "@/lib/time";
import { resendVerificationAction } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/dashboard");
  const o = await dashboardOverview(user);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={`Hi, ${user.name.split(" ")[0]}`}
        description="Your competitions, tasks and updates in one place."
        actions={
          <ButtonLink href="/competitions" variant="outline">
            Find competitions
          </ButtonLink>
        }
      />
      {sp.denied ? <Alert tone="warning">You don't have access to that area.</Alert> : null}
      {!user.emailVerifiedAt ? (
        <Alert tone="warning" title="Verify your email address">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>We sent a verification link to {user.email}. You need a verified email to register for competitions.</span>
            <InlineAction action={resendVerificationAction}>Resend link</InlineAction>
          </div>
        </Alert>
      ) : null}
      {o.invitations.map((inv) => (
        <Alert key={inv.id} tone="info" title={`Team invitation: ${inv.team.name}`}>
          You were invited to join {inv.team.name} in {inv.team.competition.title}. Open the link in your invitation email to respond.
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Competitions" value={o.registrations.length} hint="Active registrations" />
        <Stat
          label="Certificates"
          value={o.certificates}
          hint={
            <Link href="/dashboard/certificates" className="text-brand-600 hover:underline">
              View all
            </Link>
          }
        />
        {o.isJudge ? (
          <Stat
            label="Evaluations due"
            value={o.pendingEvaluations}
            tone={o.pendingEvaluations ? "warning" : undefined}
            hint={
              <Link href="/dashboard/judging" className="text-brand-600 hover:underline">
                Open judging
              </Link>
            }
          />
        ) : null}
        {o.isMentor ? (
          <Stat
            label="Mentees"
            value={o.menteeCount}
            hint={
              <Link href="/dashboard/mentoring" className="text-brand-600 hover:underline">
                Open mentoring
              </Link>
            }
          />
        ) : null}
        {o.isOrganizer ? (
          <Stat
            label="Organizer"
            value="Console"
            hint={
              <Link href="/organizer" className="text-brand-600 hover:underline">
                Manage events
              </Link>
            }
          />
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="mb-4 text-lg font-bold">My competitions</h2>
          {o.registrations.length ? (
            <ul className="space-y-3">
              {o.registrations.map((r) => {
                const meta = REGISTRATION_STATUS_META[r.status];
                return (
                  <li key={r.id}>
                    <Link href={`/dashboard/competitions/${r.competition.slug}`} className="card card-hover flex items-center gap-4 p-4">
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg">
                        <BannerArt seed={r.competition.slug} theme={r.competition.bannerTheme} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.competition.title}</p>
                        <p className="text-xs text-ink-500">
                          {TYPE_LABEL[r.competition.type]} ·{" "}
                          {r.competition.startsAt ? `Starts ${formatDate(r.competition.startsAt, r.competition.timezone)}` : "Dates TBC"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge tone={meta.tone} dot>
                          {meta.label}
                        </Badge>
                        {r.competition.resultsStatus === "PUBLISHED" ? <Badge tone="brand">Results out</Badge> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="You haven't joined a competition yet"
              description="Browse open ideathons and hackathons and register in a few minutes."
              action={<ButtonLink href="/competitions">Explore competitions</ButtonLink>}
              icon={<Icon name="search" />}
            />
          )}
        </section>
        <Card>
          <CardHeader
            title="Recent updates"
            action={
              <Link href="/dashboard/notifications" className="text-sm font-semibold text-brand-600 hover:underline">
                All
              </Link>
            }
          />
          {o.notifications.length ? (
            <ul className="divide-y divide-ink-100">
              {o.notifications.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <p className="flex items-start gap-2 text-sm font-semibold text-ink-900">
                    {!n.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" /> : null}
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{n.body}</p>
                  <p className="mt-1 text-[11px] text-ink-400">{relativeFromNow(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ink-500">No notifications yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
