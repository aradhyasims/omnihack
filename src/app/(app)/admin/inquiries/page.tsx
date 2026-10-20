import { Badge, Card, EmptyState, Icon } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { listInquiries } from "@/server/modules/admin/service";
import { formatDateTime } from "@/lib/time";
import { inquiryStatusAction } from "../actions";

export default async function InquiriesPage() {
  const admin = await requireAdminUser();
  const items = await listInquiries(admin);
  if (!items.length) return <EmptyState title="No inquiries" icon={<Icon name="bell" />} />;
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <Card key={i.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {i.name}{" "}
              <span className="text-sm font-normal text-ink-500">
                · {i.email}
                {i.organization ? ` · ${i.organization}` : ""}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Badge>{i.topic.toLowerCase().replace("_", " ")}</Badge>
              <Badge tone={i.status === "NEW" ? "warning" : i.status === "CLOSED" ? "success" : "info"}>{i.status.toLowerCase().replace("_", " ")}</Badge>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{i.message}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
            {formatDateTime(i.createdAt)}
            {i.status !== "IN_PROGRESS" ? (
              <InlineAction action={inquiryStatusAction.bind(null, i.id, "IN_PROGRESS")} variant="ghost">
                Mark in progress
              </InlineAction>
            ) : null}
            {i.status !== "CLOSED" ? (
              <InlineAction action={inquiryStatusAction.bind(null, i.id, "CLOSED")} variant="ghost">
                Close
              </InlineAction>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
