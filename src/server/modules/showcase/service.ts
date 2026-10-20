// Public project showcase. Nothing is public by default: the team leader / owner requests
// publication with showcase-specific content, and an organizer approves it.
import { z } from "zod";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireActor, requireCompetitionPermission } from "../../authz";
import { forbidden, notFound, precondition } from "../../errors";
import { checkbox, optUrl, parse, reqText, optText } from "../../validation";

async function requireProjectOwner(a: Actor, projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, include: { team: true, competition: true } });
  if (!p) throw notFound("Project");
  const owner = p.team ? p.team.leaderId === a.id : p.ownerId === a.id;
  if (!owner) throw forbidden("Only the team leader can manage the showcase listing.");
  return p;
}

export async function requestShowcase(actor: Actor | null, projectId: string, input: unknown) {
  const a = requireActor(actor);
  const p = await requireProjectOwner(a, projectId);
  if (p.status !== "ACTIVE") throw precondition("Only active projects can be showcased.");
  const submitted = await db.submission.count({ where: { projectId, status: "SUBMITTED" } });
  if (!submitted) throw precondition("Submit your project before requesting a showcase listing.");
  const d = parse(
    z.object({ showcaseSummary: reqText("Summary", 20, 1500), showcaseImpact: optText(1500), demoUrl: optUrl, repoUrl: optUrl, showMembers: checkbox }),
    input,
  );
  await db.project.update({ where: { id: projectId }, data: { ...d, showcaseStatus: "REQUESTED" } });
  await audit({ actorId: a.id, action: "showcase.requested", entityType: "Project", entityId: projectId, competitionId: p.competitionId });
}

export async function withdrawShowcase(actor: Actor | null, projectId: string) {
  const a = requireActor(actor);
  const p = await requireProjectOwner(a, projectId);
  await db.project.update({ where: { id: projectId }, data: { showcaseStatus: "PRIVATE" } });
  await audit({ actorId: a.id, action: "showcase.withdrawn", entityType: "Project", entityId: projectId, competitionId: p.competitionId });
}

export async function moderateShowcase(actor: Actor | null, projectId: string, approve: boolean) {
  const p = await db.project.findUnique({ where: { id: projectId } });
  if (!p) throw notFound("Project");
  await requireCompetitionPermission(actor, p.competitionId, "showcase.moderate");
  if (approve && p.showcaseStatus !== "REQUESTED" && p.showcaseStatus !== "REJECTED") throw precondition("Only requested listings can be approved.");
  await db.project.update({ where: { id: projectId }, data: { showcaseStatus: approve ? "PUBLISHED" : "REJECTED" } });
  await audit({
    actorId: actor!.id,
    action: approve ? "showcase.published" : "showcase.rejected",
    entityType: "Project",
    entityId: projectId,
    competitionId: p.competitionId,
  });
}

const publicSelect = {
  id: true,
  title: true,
  showcaseSummary: true,
  showcaseImpact: true,
  demoUrl: true,
  repoUrl: true,
  showMembers: true,
  updatedAt: true,
  challenge: { select: { title: true } },
  track: { select: { name: true } },
  competition: { select: { title: true, slug: true, type: true, category: true, isDemo: true, resultsStatus: true } },
  team: { select: { name: true, members: { select: { user: { select: { name: true, consentShowcase: true } } } } } },
  owner: { select: { name: true, consentShowcase: true } },
  awards: { where: { prize: { competition: { resultsStatus: "PUBLISHED" } } }, select: { prize: { select: { title: true } } } },
} as const;

function publicMembers(p: {
  showMembers: boolean;
  team: { members: { user: { name: string; consentShowcase: boolean } }[] } | null;
  owner: { name: string; consentShowcase: boolean } | null;
}) {
  if (!p.showMembers) return [];
  const list = p.team ? p.team.members.map((m) => m.user) : p.owner ? [p.owner] : [];
  return list.filter((u) => u.consentShowcase).map((u) => u.name);
}

export async function listShowcase(filters: { q?: string; type?: string; winners?: boolean; page?: number }) {
  const page = Math.max(1, filters.page ?? 1);
  const where = {
    showcaseStatus: "PUBLISHED" as const,
    status: "ACTIVE" as const,
    competition: { visibility: "PUBLIC" as const, ...(filters.type ? { type: filters.type as never } : {}) },
    ...(filters.q
      ? { OR: [{ title: { contains: filters.q, mode: "insensitive" as const } }, { showcaseSummary: { contains: filters.q, mode: "insensitive" as const } }] }
      : {}),
    ...(filters.winners ? { awards: { some: { prize: { competition: { resultsStatus: "PUBLISHED" as const } } } } } : {}),
  };
  const [total, items] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({ where, select: publicSelect, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 12, take: 12 }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / 12)), items: items.map((p) => ({ ...p, members: publicMembers(p) })) };
}

export async function getShowcaseProject(id: string) {
  const p = await db.project.findFirst({
    where: { id, showcaseStatus: "PUBLISHED", status: "ACTIVE", competition: { visibility: "PUBLIC" } },
    select: publicSelect,
  });
  return p ? { ...p, members: publicMembers(p) } : null;
}
