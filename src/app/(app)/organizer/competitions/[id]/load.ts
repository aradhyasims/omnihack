import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { getCompetitionAccess, type CompetitionPermission } from "@/server/authz";

/** Loads a competition for the organizer console; the access object drives which tabs/actions render. */
export const loadManaged = cache(async (id: string) => {
  const user = await requireUser(`/organizer/competitions/${id}`);
  const competition = await db.competition.findUnique({ where: { id }, include: { organization: true } });
  if (!competition) notFound();
  const access = await getCompetitionAccess(user, id);
  if (access.permissions.size === 0) redirect("/dashboard?denied=competition");
  const can = (p: CompetitionPermission) => access.permissions.has(p);
  return { user, competition, access, can };
});
