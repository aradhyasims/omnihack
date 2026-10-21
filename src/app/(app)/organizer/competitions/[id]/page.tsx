import Link from "next/link";
import { Alert, Badge, Card, CardHeader, Icon, Stat } from "@/components/ui/primitives";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/server/db";
import { getPublishIssues } from "@/server/modules/competitions/service";
import { registrationState } from "@/server/modules/competitions/lifecycle";
import { HOSTING_FEE_META, REG_STATE_META, STAGE_STATUS_META } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/time";
import { formatInr, isHostingEnabled } from "@/server/modules/payments/service";
import { HOSTING_FEE } from "@/config/payments";
import { BankDetails, TransferForm } from "@/components/payments/bank-transfer";
import { archiveAction, cancelAction, publishAction, registrationClosedAction, submitHostingFeeAction, unpublishAction } from "../../actions";
import { loadManaged } from "./load";
import { EventDocumentsCard } from "./event-documents";
import { eventHasEnded } from "@/server/modules/competitions/documents";

export default async function ManageOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { competition: c, can } = await loadManaged(id);
  const [regs, teams, projects, submitted, pendingRegs, stages, history, feePayment] = await Promise.all([
    db.registration.count({ where: { competitionId: id, status: { in: ["APPROVED", "PENDING"] } } }),
    db.team.count({ where: { competitionId: id, status: { in: ["FORMING", "LOCKED"] } } }),
    db.project.count({ where: { competitionId: id, status: "ACTIVE" } }),
    db.submission.count({ where: { stage: { competitionId: id }, status: "SUBMITTED" } }),
    db.registration.count({ where: { competitionId: id, status: "PENDING" } }),
    db.stage.findMany({ where: { competitionId: id }, orderBy: { order: "asc" } }),
    db.competitionStatusChange.findMany({ where: { competitionId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.hostingFeePayment.findFirst({ where: { competitionId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const testimonials = can("competition.edit") ? await db.testimonial.findMany({ where: { competitionId: id }, orderBy: { createdAt: "desc" } }) : [];
  const enabled = isHostingEnabled(c);
  const issues = c.status === "DRAFT" ? await getPublishIssues(id) : [];
  const reg = registrationState(c, regs);
  return (
    <div className="space-y-6">
      {c.status === "PENDING_APPROVAL" ? (
        <Alert tone="warning" title="Awaiting platform approval">
          A platform administrator will review this competition. You'll be notified when it's approved.
        </Alert>
      ) : null}
      {c.status === "CANCELLED" ? (
        <Alert tone="danger" title="Cancelled">
          {c.cancellationReason}
        </Alert>
      ) : null}

      <div id="hosting-fee" className="scroll-mt-24">
      <Card>
        <CardHeader
          title="Hosting fee"
          description={`${formatInr(c.hostingFeeAmountMinor)} per competition, paid to OmniHack. Publishing and access to judges & mentors unlock once it's verified.`}
          action={<Badge tone={HOSTING_FEE_META[c.hostingFeeStatus].tone}>{HOSTING_FEE_META[c.hostingFeeStatus].label}</Badge>}
        />
        <div className="space-y-4 p-5">
          {enabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-700">
                {c.hostingFeeStatus === "WAIVED"
                  ? "OmniHack waived the hosting fee for this competition."
                  : `Payment received${feePayment?.utr ? ` (UTR ${feePayment.utr})` : ""} — this competition is enabled.`}
              </p>
              {can("staff.manage") ? (
                <ButtonLink href={`/organizer/competitions/${id}/mentors`} size="sm" variant="outline">
                  Find mentors & judges
                </ButtonLink>
              ) : null}
            </div>
          ) : c.hostingFeeStatus === "SUBMITTED" && feePayment ? (
            <p className="text-sm text-ink-700">
              We received your payment details — UTR <strong className="font-mono">{feePayment.utr}</strong>, paid on {formatDate(feePayment.paidOn, "UTC")} by{" "}
              {feePayment.payerName}. OmniHack is verifying the transfer and will notify you when the competition is enabled.
            </p>
          ) : (
            <>
              {c.hostingFeeStatus === "REJECTED" && feePayment?.reviewNote ? (
                <Alert tone="danger" title={`We couldn't verify UTR ${feePayment.utr}`}>
                  {feePayment.reviewNote} Please check the details and submit again.
                </Alert>
              ) : null}
              <BankDetails
                amount={formatInr(c.hostingFeeAmountMinor)}
                accountName={HOSTING_FEE.payee.accountName}
                accountNumber={HOSTING_FEE.payee.accountNumber}
                ifsc={HOSTING_FEE.payee.ifsc}
                bank={HOSTING_FEE.payee.bank}
                branch={HOSTING_FEE.payee.branch}
              />
              {can("competition.edit") ? (
                <div>
                  <p className="mb-3 text-sm font-semibold text-ink-800">After paying, tell us the transfer details:</p>
                  <TransferForm action={submitHostingFeeAction.bind(null, id)} />
                </div>
              ) : (
                <p className="text-sm text-ink-500">A competition owner or coordinator can submit the payment details.</p>
              )}
            </>
          )}
        </div>
      </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Registrations"
          value={regs}
          hint={
            pendingRegs ? (
              <Link className="text-amber-700 hover:underline" href={`/organizer/competitions/${id}/registrations?status=PENDING`}>
                {pendingRegs} awaiting review
              </Link>
            ) : (
              `of ${c.maxParticipants ?? "unlimited"}`
            )
          }
        />
        <Stat label="Teams" value={teams} />
        <Stat label="Active projects" value={projects} />
        <Stat label="Submissions" value={submitted} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Publication & lifecycle" description={`Registration: ${REG_STATE_META[reg].label}`} />
          <div className="space-y-5 p-5">
            {c.status === "DRAFT" ? (
              issues.length ? (
                <div>
                  <p className="text-sm font-semibold text-ink-800">Complete these items before publishing:</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink-600">
                    {issues.map((i) => (
                      <li key={i} className="flex gap-2">
                        <Icon name="close" className="mt-0.5 h-4 w-4 text-rose-500" />
                        {i}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink href={`/organizer/competitions/${id}/edit`} size="sm" className="mt-4">
                    Continue setup
                  </ButtonLink>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="success">
                    <Icon name="check" className="h-3.5 w-3.5" /> Ready to publish
                  </Badge>
                  {can("competition.publish") ? (
                    <ConfirmAction
                      action={publishAction.bind(null, id)}
                      label={c.organization.verified ? "Publish now" : "Submit for approval"}
                      variant="primary"
                      confirmVariant="primary"
                      title={c.organization.verified ? "Publish this competition?" : "Submit for platform approval?"}
                      description={
                        c.organization.verified
                          ? "It will become visible according to its visibility setting and registration will follow the configured dates."
                          : "Your organization isn't verified yet, so a platform administrator will review the competition first."
                      }
                      confirmLabel={c.organization.verified ? "Publish" : "Submit"}
                    />
                  ) : null}
                </div>
              )
            ) : null}
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/competitions/${c.slug}`} variant="outline" size="sm">
                Preview event page
              </ButtonLink>
              {c.status === "PUBLISHED" && can("competition.publish") ? (
                <>
                  <InlineAction action={registrationClosedAction.bind(null, id, !c.registrationClosedManually)}>
                    {c.registrationClosedManually ? "Reopen registration" : "Close registration"}
                  </InlineAction>
                  <ConfirmAction
                    action={unpublishAction.bind(null, id)}
                    label="Unpublish"
                    title="Unpublish this competition?"
                    description="Only possible while nobody has registered. It returns to draft."
                    confirmLabel="Unpublish"
                  />
                </>
              ) : null}
              {(c.status === "PUBLISHED" || c.status === "DRAFT") && can("competition.cancel") ? (
                <ConfirmAction
                  action={cancelAction.bind(null, id)}
                  label="Cancel event"
                  title="Cancel this competition?"
                  description="Registered participants will be notified with your reason. This cannot be undone."
                  reasonLabel="Reason (shown to participants)"
                  reasonRequired
                  confirmLabel="Cancel competition"
                />
              ) : null}
              {(c.status === "COMPLETED" || c.status === "CANCELLED") && can("competition.archive") ? (
                <ConfirmAction
                  action={archiveAction.bind(null, id)}
                  label="Archive"
                  title="Archive this competition?"
                  description="Archived competitions are read-only."
                  confirmLabel="Archive"
                />
              ) : null}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Stages"
            action={
              can("stage.manage") ? (
                <Link href={`/organizer/competitions/${id}/stages`} className="text-sm font-semibold text-brand-600 hover:underline">
                  Manage
                </Link>
              ) : null
            }
          />
          <ol className="divide-y divide-ink-100">
            {stages.map((s) => (
              <li key={s.id} className={`flex items-center justify-between gap-3 px-5 py-3 text-sm ${s.enabled ? "" : "opacity-50"}`}>
                <span className="font-medium">
                  {s.order}. {s.name}
                </span>
                <Badge tone={s.enabled ? STAGE_STATUS_META[s.status].tone : "neutral"}>{s.enabled ? STAGE_STATUS_META[s.status].label : "Disabled"}</Badge>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {can("competition.edit") ? <EventDocumentsCard c={c} ended={eventHasEnded(c)} testimonials={testimonials} /> : null}

      {history.length ? (
        <Card>
          <CardHeader title="Status history" />
          <ul className="divide-y divide-ink-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                <span>
                  {h.fromStatus.toLowerCase()} → <strong>{h.toStatus.toLowerCase()}</strong>
                  {h.reason ? <span className="text-ink-500"> — {h.reason}</span> : null}
                </span>
                <span className="text-xs text-ink-500">{formatDateTime(h.createdAt, c.timezone)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
