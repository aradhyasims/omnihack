import Link from "next/link";
import { Card, CardHeader, EmptyState, Icon } from "@/components/ui/primitives";
import { ConfirmAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { pendingApprovals } from "@/server/modules/admin/service";
import { TYPE_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { reviewPublicationAction } from "../actions";

export default async function ApprovalsPage() {
  const user = await requireAdminUser();
  const items = await pendingApprovals(user);
  if (!items.length)
    return (
      <EmptyState
        title="Nothing to review"
        description="Competitions from unverified organizations appear here before publication."
        icon={<Icon name="check" />}
      />
    );
  return (
    <div className="space-y-4">
      {items.map((c) => (
        <Card key={c.id}>
          <CardHeader
            title={c.title}
            description={`${TYPE_LABEL[c.type]} · ${c.organization.name} · submitted by ${c.createdBy.name} (${c.createdBy.email}) · ${formatDateTime(c.updatedAt)}`}
          />
          <div className="space-y-3 p-5">
            <p className="text-sm text-ink-700">{c.tagline}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/competitions/${c.slug}`} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold hover:bg-ink-50">
                Review page
              </Link>
              <ConfirmAction
                action={reviewPublicationAction.bind(null, c.id, true)}
                label="Approve & publish"
                variant="primary"
                confirmVariant="primary"
                title={`Publish ${c.title}?`}
                confirmLabel="Approve"
              />
              <ConfirmAction
                action={reviewPublicationAction.bind(null, c.id, false)}
                label="Return to organizer"
                title="Return to draft"
                reasonLabel="What needs to change?"
                reasonRequired
                confirmLabel="Return"
              />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
