import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { COMPETITION_STATUS_META, TYPE_LABEL } from "@/lib/labels";
import { featureAction } from "../actions";

export default async function AdminCompetitionsPage() {
  await requireAdminUser();
  const rows = await db.competition.findMany({ include: { organization: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 200 });
  return (
    <div className="card overflow-x-auto">
      <table className="table-om">
        <thead>
          <tr>
            <th>Competition</th>
            <th>Status</th>
            <th>Visibility</th>
            <th>Featured</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/organizer/competitions/${c.id}`} className="font-semibold text-ink-900 hover:underline">
                  {c.title}
                </Link>
                <span className="block text-xs">
                  {TYPE_LABEL[c.type]} · {c.organization.name}
                </span>
              </td>
              <td>
                <Badge tone={COMPETITION_STATUS_META[c.status].tone}>{COMPETITION_STATUS_META[c.status].label}</Badge>
              </td>
              <td className="text-xs">{c.visibility.toLowerCase()}</td>
              <td>
                <InlineAction action={featureAction.bind(null, c.id, !c.isFeatured)} variant="ghost">
                  {c.isFeatured ? "★ Unfeature" : "☆ Feature"}
                </InlineAction>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
