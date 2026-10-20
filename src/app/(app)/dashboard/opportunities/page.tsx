import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, Icon, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm";
import { OPENING_TYPE_LABEL } from "@/components/talent/opening-card";
import { requireUser } from "@/server/auth/current";
import { myOpportunities } from "@/server/modules/talent/service";
import { APPLICATION_STATUS_META } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/time";
import { respondApplicationAction } from "../actions";

export const metadata: Metadata = { title: "Internships & jobs" };

export default async function MyOpportunitiesPage() {
  const user = await requireUser("/dashboard/opportunities");
  const { applications, consents } = await myOpportunities(user);
  const active = applications.filter((a) => !["OFFER_ACCEPTED", "OFFER_DECLINED", "NOT_SELECTED", "WITHDRAWN"].includes(a.status));
  const closed = applications.filter((a) => !active.includes(a));
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Careers"
        title="Internships & jobs"
        description="Shortlists, interviews and offers from companies hiring through your competitions."
        actions={
          <ButtonLink href="/opportunities" variant="outline">
            Browse open roles
          </ButtonLink>
        }
      />

      {applications.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Join the talent pool in a hiring competition (from its workspace) so hiring partners can discover your work."
          icon={<Icon name="briefcase" />}
          action={<ButtonLink href="/competitions?hiring=1">Find hiring competitions</ButtonLink>}
        />
      ) : null}

      {active.length ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">In progress</h2>
          {active.map((a) => (
            <ApplicationCard key={a.id} a={a} />
          ))}
        </section>
      ) : null}

      {closed.length ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">Closed</h2>
          {closed.map((a) => (
            <ApplicationCard key={a.id} a={a} />
          ))}
        </section>
      ) : null}

      <Card>
        <CardHeader title="Talent-pool memberships" description="Competitions where hiring partners can view your profile." />
        {consents.length ? (
          <ul className="divide-y divide-ink-100 text-sm">
            {consents.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span>
                  <Link href={`/dashboard/competitions/${c.competition.slug}`} className="font-semibold hover:underline">
                    {c.competition.title}
                  </Link>
                  <span className="block text-xs text-ink-500">
                    {c.withdrawnAt ? `Withdrawn ${formatDate(c.withdrawnAt)}` : `Joined ${formatDate(c.consentedAt)}`} · interested in{" "}
                    {c.roleInterests.map((t) => OPENING_TYPE_LABEL[t]).join(", ")}
                  </span>
                </span>
                <Badge tone={c.withdrawnAt ? "neutral" : "success"}>{c.withdrawnAt ? "Not visible" : "Visible to hiring partners"}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-500">You haven't joined any talent pool.</p>
        )}
      </Card>
    </div>
  );
}

type App = Awaited<ReturnType<typeof myOpportunities>>["applications"][number];

function ApplicationCard({ a }: { a: App }) {
  const meta = APPLICATION_STATUS_META[a.status];
  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div>
          <p className="text-lg font-bold">{a.opening?.title ?? "Open application"}</p>
          <p className="text-sm text-ink-600">
            <span className="font-semibold">{a.company}</span>
            {a.opening ? ` · ${OPENING_TYPE_LABEL[a.opening.type]}` : ""} · via{" "}
            <Link href={`/competitions/${a.competition.slug}`} className="text-brand-600 hover:underline">
              {a.competition.title}
            </Link>
          </p>
        </div>
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
      </div>
      <div className="space-y-4 px-5 py-4 text-sm">
        {a.status === "INTERVIEW_INVITED" || a.status === "INTERVIEW_ACCEPTED" ? (
          <div className="rounded-xl bg-amber-50/70 p-4">
            <p className="font-semibold text-amber-900">Interview</p>
            {a.interviewAt ? <p className="text-amber-900">{formatDateTime(a.interviewAt, a.competition.timezone)}</p> : null}
            {a.interviewDetails ? <p className="mt-1 whitespace-pre-line text-amber-900/90">{a.interviewDetails}</p> : null}
          </div>
        ) : null}
        {a.offerDetails && ["OFFERED", "OFFER_ACCEPTED", "OFFER_DECLINED"].includes(a.status) ? (
          <div className="rounded-xl bg-emerald-50/70 p-4">
            <p className="font-semibold text-emerald-900">Offer {a.offerType ? `· ${OPENING_TYPE_LABEL[a.offerType]}` : ""}</p>
            <p className="mt-1 whitespace-pre-line text-emerald-900/90">{a.offerDetails}</p>
          </div>
        ) : null}
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
          {a.events.map((e, i) => (
            <li key={i}>
              {APPLICATION_STATUS_META[e.toStatus].label} · {formatDate(e.createdAt)}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-2">
          {a.status === "INTERVIEW_INVITED" ? (
            <ActionForm
              action={respondApplicationAction.bind(null, a.id, "ACCEPT_INTERVIEW")}
              className="flex flex-wrap items-end gap-2"
              successMessage={false}
            >
              <TextInput label={<span className="sr-only">Message</span>} name="note" placeholder="Optional message (e.g. availability)" />
              <SubmitButton size="sm">Accept interview</SubmitButton>
            </ActionForm>
          ) : null}
          {a.status === "OFFERED" ? (
            <>
              <ConfirmAction
                action={respondApplicationAction.bind(null, a.id, "ACCEPT_OFFER")}
                label="Accept offer"
                variant="primary"
                confirmVariant="primary"
                title={`Accept the offer from ${a.company}?`}
                description="The company will be notified. Formal paperwork (offer letter, contract) is handled directly by the company."
                confirmLabel="Accept offer"
              />
              <ConfirmAction
                action={respondApplicationAction.bind(null, a.id, "DECLINE_OFFER")}
                label="Decline"
                title={`Decline the offer from ${a.company}?`}
                reasonLabel="Message to the company (optional)"
                confirmLabel="Decline offer"
              />
            </>
          ) : null}
          {["SHORTLISTED", "INTERVIEW_INVITED", "INTERVIEW_ACCEPTED", "OFFERED"].includes(a.status) ? (
            <ConfirmAction
              action={respondApplicationAction.bind(null, a.id, "WITHDRAW")}
              label="Withdraw"
              variant="ghost"
              title="Withdraw from this process?"
              reasonLabel="Reason (optional)"
              confirmLabel="Withdraw"
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
