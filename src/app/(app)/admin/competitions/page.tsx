import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { COMPETITION_STATUS_META, TYPE_LABEL } from "@/lib/labels";
import { deleteCompetitionAction, featureAction } from "../actions";

export default async function AdminCompetitionsPage() {
  const admin = await requireAdminUser();
  const isSuperAdmin = admin.platformRole === "SUPER_ADMIN";
  const rows = await db.competition.findMany({
    include: { organization: { select: { name: true } }, _count: { select: { registrations: true, teams: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          Admins can open and edit any competition. {isSuperAdmin ? "As a super admin you can also delete one permanently." : null}
        </p>
        <ButtonLink href="/organizer/competitions/new" size="sm">
          New competition
        </ButtonLink>
      </div>
      <div className="card overflow-x-auto">
        <table className="table-om">
          <thead>
            <tr>
              <th>Competition</th>
              <th>Status</th>
              <th>Visibility</th>
              <th className="text-right">Registrations</th>
              <th>Featured</th>
              {isSuperAdmin ? <th className="sr-only">Delete</th> : null}
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
                <td className="text-right tabular-nums">{c._count.registrations}</td>
                <td>
                  <InlineAction action={featureAction.bind(null, c.id, !c.isFeatured)} variant="ghost">
                    {c.isFeatured ? "★ Unfeature" : "☆ Feature"}
                  </InlineAction>
                </td>
                {isSuperAdmin ? (
                  <td className="text-right">
                    <ConfirmAction
                      action={deleteCompetitionAction.bind(null, c.id)}
                      label="Delete"
                      variant="ghost"
                      className="text-rose-700 hover:bg-rose-50"
                      title={`Permanently delete “${c.title}”?`}
                      description={
                        <>
                          This removes the competition and <strong>everything in it</strong> — {c._count.registrations} registration(s), {c._count.teams}{" "}
                          team(s), projects, submissions and uploaded files, scores, results, certificates and hiring data. It cannot be undone.
                          Participants are not notified; to keep a record and tell them, cancel or archive it instead.
                        </>
                      }
                      reasonLabel={`Type “${c.title}” to confirm`}
                      reasonRequired
                      confirmLabel="Delete permanently"
                    />
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={isSuperAdmin ? 6 : 5} className="text-center">
                  No competitions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
