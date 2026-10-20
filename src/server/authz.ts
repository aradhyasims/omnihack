// Permission-based authorization.
//
// Roles are resolved from three sources and converted to permissions:
//   1. Platform role (USER / ADMIN / SUPER_ADMIN)
//   2. Organization membership (OWNER / COORDINATOR / MEMBER) for the competition's organization
//   3. Competition-specific assignments (OWNER, OPS_COORDINATOR, JUDGE, MENTOR, SPONSOR_REP, AUDITOR, VOLUNTEER)
// Participant / team-leader / team-member / judge / mentor access is additionally checked by
// ownership or assignment in each service (e.g. "is this judge assigned to this project?").
// Every protected service function calls one of the require* helpers — the UI hiding a button is
// never the only control.
import type { CompetitionRole, OrgRole, PlatformRole, UserStatus } from "@prisma/client";
import { db } from "./db";
import { forbidden, notFound, unauthenticated } from "./errors";

export type Actor = {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
};

export const COMPETITION_PERMISSIONS = [
  "competition.view_private",
  "competition.edit",
  "competition.publish",
  "competition.cancel",
  "competition.archive",
  "stage.manage",
  "registration.review",
  "team.manage",
  "submission.view_all",
  "judge.assign",
  "mentor.assign",
  "staff.manage",
  "evaluation.view_all",
  "evaluation.correct",
  "advancement.decide",
  "results.prepare",
  "results.approve",
  "results.publish",
  "certificate.issue",
  "attendance.manage",
  "attendance.override",
  "announcement.create",
  "schedule.manage",
  "support.respond",
  "analytics.view",
  "audit.view",
  "showcase.moderate",
  "sponsor.manage",
  "sponsor.report_view",
  // Placement & recruitment
  "hiring.manage", // hiring settings and job/internship openings
  "talent.view", // consented candidate profiles, shortlists and the hiring pipeline (personal data)
] as const;

export type CompetitionPermission = (typeof COMPETITION_PERMISSIONS)[number];

const ALL = new Set<CompetitionPermission>(COMPETITION_PERMISSIONS);
const except = (...omit: CompetitionPermission[]) => new Set(COMPETITION_PERMISSIONS.filter((p) => !omit.includes(p)));

/** Organization role → competition permissions for every competition in that organization. */
export const ORG_ROLE_GRANTS: Record<OrgRole, Set<CompetitionPermission>> = {
  OWNER: ALL,
  // Coordinators run events but result approval is reserved for owners (separation of duties).
  // Candidate data is limited to owners and recruiters (data minimization).
  COORDINATOR: except("results.approve", "staff.manage", "talent.view"),
  MEMBER: new Set(["competition.view_private", "analytics.view"]),
};

/** Competition-specific role → permissions. JUDGE and MENTOR rely on assignment checks instead. */
export const COMPETITION_ROLE_GRANTS: Record<CompetitionRole, Set<CompetitionPermission>> = {
  // The person who creates or runs an event cannot also be the one who approves its results:
  // approval is reserved for organization owners (and platform administrators).
  OWNER: except("results.approve"),
  OPS_COORDINATOR: new Set([
    "competition.view_private",
    "registration.review",
    "team.manage",
    "attendance.manage",
    "attendance.override",
    "announcement.create",
    "schedule.manage",
    "support.respond",
    "analytics.view",
  ]),
  AUDITOR: new Set(["competition.view_private", "submission.view_all", "evaluation.view_all", "analytics.view", "audit.view"]),
  SPONSOR_REP: new Set(["sponsor.report_view"]),
  VOLUNTEER: new Set(["attendance.manage"]),
  // Recruiters see only candidates who opted in; they cannot see scores, comments or other data.
  RECRUITER: new Set(["hiring.manage", "talent.view"]),
  JUDGE: new Set(),
  MENTOR: new Set(),
};

export function isPlatformAdmin(actor: Pick<Actor, "platformRole"> | null | undefined): boolean {
  return actor?.platformRole === "ADMIN" || actor?.platformRole === "SUPER_ADMIN";
}

export type CompetitionAccess = {
  competitionId: string;
  organizationId: string;
  permissions: Set<CompetitionPermission>;
  roles: CompetitionRole[];
  orgRole: OrgRole | null;
};

export async function getCompetitionAccess(actor: Actor | null, competitionId: string): Promise<CompetitionAccess> {
  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, organizationId: true },
  });
  if (!competition) throw notFound("Competition");
  const base: CompetitionAccess = {
    competitionId,
    organizationId: competition.organizationId,
    permissions: new Set(),
    roles: [],
    orgRole: null,
  };
  if (!actor || actor.status !== "ACTIVE") return base;
  if (isPlatformAdmin(actor)) return { ...base, permissions: new Set(ALL) };

  const [orgMembership, memberships] = await Promise.all([
    db.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: competition.organizationId, userId: actor.id } },
      select: { role: true },
    }),
    db.competitionMember.findMany({
      where: { competitionId, userId: actor.id, status: "ACTIVE" },
      select: { role: true },
    }),
  ]);
  const permissions = new Set<CompetitionPermission>();
  if (orgMembership) ORG_ROLE_GRANTS[orgMembership.role].forEach((p) => permissions.add(p));
  const roles = memberships.map((m) => m.role);
  roles.forEach((r) => COMPETITION_ROLE_GRANTS[r].forEach((p) => permissions.add(p)));
  return { ...base, permissions, roles, orgRole: orgMembership?.role ?? null };
}

export function requireActor(actor: Actor | null | undefined): Actor {
  if (!actor) throw unauthenticated();
  if (actor.status !== "ACTIVE") throw forbidden("This account is not active.");
  return actor;
}

export async function requireCompetitionPermission(
  actor: Actor | null | undefined,
  competitionId: string,
  permission: CompetitionPermission,
): Promise<CompetitionAccess> {
  const a = requireActor(actor);
  const access = await getCompetitionAccess(a, competitionId);
  if (!access.permissions.has(permission)) throw forbidden();
  return access;
}

export async function hasCompetitionPermission(actor: Actor | null | undefined, competitionId: string, permission: CompetitionPermission): Promise<boolean> {
  if (!actor) return false;
  const access = await getCompetitionAccess(actor, competitionId);
  return access.permissions.has(permission);
}

export function requirePlatformAdmin(actor: Actor | null | undefined): Actor {
  const a = requireActor(actor);
  if (!isPlatformAdmin(a)) throw forbidden();
  return a;
}

export function requireSuperAdmin(actor: Actor | null | undefined): Actor {
  const a = requireActor(actor);
  if (a.platformRole !== "SUPER_ADMIN") throw forbidden();
  return a;
}

export async function requireOrgRole(actor: Actor | null | undefined, organizationId: string, roles: OrgRole[]) {
  const a = requireActor(actor);
  if (isPlatformAdmin(a)) return;
  const m = await db.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: a.id } },
  });
  if (!m || !roles.includes(m.role)) throw forbidden();
}

/** True if the actor holds any staff-level role on the competition (used for navigation only). */
export async function isCompetitionStaff(actor: Actor | null, competitionId: string): Promise<boolean> {
  if (!actor) return false;
  const access = await getCompetitionAccess(actor, competitionId);
  return access.permissions.size > 0;
}
