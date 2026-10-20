import { redirect } from "next/navigation";
import { Pagination } from "@/components/ui/primitives";
import { auditLog } from "@/server/modules/admin/service";
import { formatDateTime } from "@/lib/time";
import { loadManaged } from "../load";

export default async function CompetitionAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, competition, can } = await loadManaged(id);
  if (!can("audit.view")) redirect(`/organizer/competitions/${id}`);
  const log = await auditLog(user, { competitionId: id, action: sp.action, page: Number(sp.page) || 1 }, { platform: false });
  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          name="action"
          defaultValue={sp.action}
          placeholder="Filter by action, e.g. results."
          aria-label="Filter actions"
          className="h-9 w-72 rounded-lg border border-ink-200 px-3 text-sm"
        />
        <button className="h-9 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table-om">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {log.items.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt, competition.timezone)}</td>
                <td className="text-xs">{e.actor?.name ?? "System"}</td>
                <td className="font-mono text-xs">{e.action}</td>
                <td className="text-xs">{e.entityType}</td>
                <td className="max-w-md truncate font-mono text-[11px]" title={JSON.stringify(e.meta)}>
                  {JSON.stringify(e.meta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={Number(sp.page) || 1}
        pageCount={log.pageCount}
        hrefFor={(p) => `?page=${p}${sp.action ? `&action=${encodeURIComponent(sp.action)}` : ""}`}
      />
    </div>
  );
}
