import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, Icon } from "@/components/ui/primitives";
import { ConfirmAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { formatInr, hostingFeeQueue } from "@/server/modules/payments/service";
import { HOSTING_FEE } from "@/config/payments";
import { HOSTING_FEE_META } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/time";
import { reviewHostingFeeAction, waiveHostingFeeAction } from "../actions";

export default async function AdminPaymentsPage() {
  const admin = await requireAdminUser();
  const q = await hostingFeeQueue(admin);
  const acct = `${HOSTING_FEE.payee.accountName} · ${HOSTING_FEE.payee.bank} ·  A/c ${HOSTING_FEE.payee.accountNumber}`;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Hosting fees to verify"
          description={`Match each UTR and amount against the statement for ${acct}, then acknowledge it to enable the competition.`}
        />
        {q.submitted.length ? (
          <ul className="divide-y divide-ink-100">
            {q.submitted.map((p) => {
              const by = q.users[p.submittedById];
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 text-sm">
                    <Link href={`/organizer/competitions/${p.competition.id}`} className="font-semibold text-ink-900 hover:underline">
                      {p.competition.title}
                    </Link>
                    <span className="text-ink-500"> · {p.competition.organization.name}</span>
                    <p className="mt-1">
                      <strong className="font-display text-base">{formatInr(p.amountMinor)}</strong> · UTR{" "}
                      <span className="select-all font-mono font-semibold">{p.utr}</span> · paid {formatDate(p.paidOn, "UTC")} from {p.payerName}
                    </p>
                    <p className="text-xs text-ink-500">
                      Submitted {formatDateTime(p.createdAt)} by {by ? `${by.name} (${by.email})` : "organizer"}
                      {p.note ? ` · “${p.note}”` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ConfirmAction
                      action={reviewHostingFeeAction.bind(null, p.id, true)}
                      label="Acknowledge & enable"
                      variant="primary"
                      confirmVariant="primary"
                      title={`Confirm ${formatInr(p.amountMinor)} received for “${p.competition.title}”?`}
                      description={`Only confirm after you see UTR ${p.utr} for ${formatInr(p.amountMinor)} in the ${HOSTING_FEE.payee.bank} statement. The organizer can then publish and add judges and mentors.`}
                      confirmLabel="Payment received"
                    />
                    <ConfirmAction
                      action={reviewHostingFeeAction.bind(null, p.id, false)}
                      label="Reject"
                      variant="ghost"
                      title="Reject this payment?"
                      reasonLabel="What should the organizer check? (shown to them)"
                      reasonRequired
                      confirmLabel="Reject"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState title="Nothing to verify" description="Organizers' reported transfers appear here." icon={<Icon name="check" />} />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Competitions without a hosting fee" description="Waive the fee for OmniHack's own events or approved partners." />
        {q.unpaid.length ? (
          <ul className="divide-y divide-ink-100">
            {q.unpaid.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>
                  <Link href={`/organizer/competitions/${c.id}`} className="font-semibold text-ink-900 hover:underline">
                    {c.title}
                  </Link>
                  <span className="text-ink-500">
                    {" "}
                    · {c.organization.name} · created {formatDate(c.createdAt)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={HOSTING_FEE_META[c.hostingFeeStatus].tone}>{HOSTING_FEE_META[c.hostingFeeStatus].label}</Badge>
                  <ConfirmAction
                    action={waiveHostingFeeAction.bind(null, c.id)}
                    label="Waive fee"
                    variant="ghost"
                    title={`Waive the hosting fee for “${c.title}”?`}
                    description="The competition is enabled without payment. This is recorded in the audit log."
                    reasonLabel="Reason (kept in the audit log)"
                    reasonRequired
                    confirmLabel="Waive & enable"
                    confirmVariant="primary"
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-ink-500">Every active competition has its hosting fee settled.</p>
        )}
      </Card>

      {q.reviewed.length ? (
        <Card>
          <CardHeader title="Recently reviewed" />
          <div className="overflow-x-auto">
            <table className="table-om">
              <thead>
                <tr>
                  <th>Competition</th>
                  <th>Amount</th>
                  <th>UTR</th>
                  <th>Result</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {q.reviewed.map((p) => (
                  <tr key={p.id}>
                    <td className="text-xs">
                      <span className="font-semibold text-ink-900">{p.competition.title}</span>
                      <span className="block">{p.competition.organization.name}</span>
                    </td>
                    <td className="text-xs">{formatInr(p.amountMinor)}</td>
                    <td className="font-mono text-xs">{p.utr}</td>
                    <td className="text-xs">
                      <Badge tone={p.status === "VERIFIED" ? "success" : "danger"}>{p.status.toLowerCase()}</Badge>
                      {p.reviewNote ? <span className="mt-1 block">{p.reviewNote}</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {formatDateTime(p.reviewedAt)}
                      {p.reviewedById && q.users[p.reviewedById] ? <span className="block">{q.users[p.reviewedById].name}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
