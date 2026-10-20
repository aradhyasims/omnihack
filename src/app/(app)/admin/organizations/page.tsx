import { Badge } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { listOrganizations } from "@/server/modules/admin/service";
import { formatDate } from "@/lib/time";
import { verifyOrgAction } from "../actions";

export default async function OrganizationsAdminPage() {
  const admin = await requireAdminUser();
  const orgs = await listOrganizations(admin);
  return (
    <div className="card overflow-x-auto">
      <table className="table-om">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Type</th>
            <th className="text-right">Members</th>
            <th className="text-right">Competitions</th>
            <th>Created</th>
            <th>Verification</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td>
                <span className="font-semibold text-ink-900">{o.name}</span> {o.isDemo ? <Badge tone="warning">demo</Badge> : null}
                {o.website ? <span className="block text-xs">{o.website}</span> : null}
              </td>
              <td className="text-xs">{o.type.toLowerCase()}</td>
              <td className="text-right">{o._count.members}</td>
              <td className="text-right">{o._count.competitions}</td>
              <td className="text-xs">{formatDate(o.createdAt)}</td>
              <td>
                <div className="flex items-center gap-2">
                  <Badge tone={o.verified ? "success" : "neutral"}>{o.verified ? "Verified" : "Unverified"}</Badge>
                  <InlineAction action={verifyOrgAction.bind(null, o.id, !o.verified)} variant="ghost">
                    {o.verified ? "Revoke" : "Verify"}
                  </InlineAction>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
