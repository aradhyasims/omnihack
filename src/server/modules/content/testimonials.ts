// Testimonials. Only super admins (the OmniHack master admin) add, edit, publish, feature or delete them.
// Organizers may submit testimonials received for their own event once it has ended; submissions stay
// private drafts until the master admin reviews and publishes them.
import { z } from "zod";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireCompetitionPermission, requireSuperAdmin } from "../../authz";
import { notFound, precondition } from "../../errors";
import { notify } from "../../notifications/notify";
import { checkbox, optText, parse, reqText } from "../../validation";
import { eventHasEnded } from "../competitions/documents";

export const TESTIMONIAL_CATEGORIES = ["INSTITUTION", "COMPANY", "RECRUITMENT", "PARTICIPANT", "MENTOR", "OTHER"] as const;

const baseSchema = z.object({
  category: z.enum(TESTIMONIAL_CATEGORIES, { errorMap: () => ({ message: "Choose who the testimonial is from." }) }),
  quote: reqText("Testimonial", 20, 1200),
  authorName: reqText("Name", 2, 100),
  authorTitle: optText(120),
  organization: reqText("Organization", 2, 150),
});

const adminSchema = baseSchema.extend({
  competitionId: optText(40),
  published: checkbox,
  featured: checkbox,
  sortOrder: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().int().min(0).max(999)),
});

async function checkCompetition(id: string | null) {
  if (id && !(await db.competition.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Competition");
}

export async function createTestimonial(actor: Actor | null, input: unknown) {
  const admin = requireSuperAdmin(actor);
  const d = parse(adminSchema, input);
  await checkCompetition(d.competitionId);
  const t = await db.testimonial.create({ data: { ...d, createdById: admin.id } });
  await audit({ actorId: admin.id, action: "testimonial.created", entityType: "Testimonial", entityId: t.id, meta: { published: d.published, featured: d.featured } });
  return t;
}

export async function updateTestimonial(actor: Actor | null, id: string, input: unknown) {
  const admin = requireSuperAdmin(actor);
  const d = parse(adminSchema, input);
  await checkCompetition(d.competitionId);
  if (!(await db.testimonial.findUnique({ where: { id } }))) throw notFound("Testimonial");
  await db.testimonial.update({ where: { id }, data: d });
  await audit({ actorId: admin.id, action: "testimonial.updated", entityType: "Testimonial", entityId: id, meta: { published: d.published, featured: d.featured } });
}

export async function deleteTestimonial(actor: Actor | null, id: string) {
  const admin = requireSuperAdmin(actor);
  const t = await db.testimonial.findUnique({ where: { id } });
  if (!t) throw notFound("Testimonial");
  await db.testimonial.delete({ where: { id } });
  await audit({ actorId: admin.id, action: "testimonial.deleted", entityType: "Testimonial", entityId: id, meta: { authorName: t.authorName, organization: t.organization } });
}

export async function listAllTestimonials(actor: Actor | null) {
  requireSuperAdmin(actor);
  return db.testimonial.findMany({
    include: { competition: { select: { id: true, title: true, slug: true } } },
    orderBy: [{ published: "asc" }, { featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

/** Organizer submission for their own (ended) event — always a draft for the master admin to review. */
export async function submitEventTestimonial(actor: Actor | null, competitionId: string, input: unknown) {
  await requireCompetitionPermission(actor, competitionId, "competition.edit");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (!eventHasEnded(c)) throw precondition("Testimonials can be submitted once the event has ended.");
  const d = parse(baseSchema, input);
  const t = await db.testimonial.create({ data: { ...d, competitionId, published: false, featured: false, createdById: actor!.id } });
  await audit({ actorId: actor!.id, action: "testimonial.submitted", entityType: "Testimonial", entityId: t.id, competitionId });
  const masters = await db.user.findMany({ where: { platformRole: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
  await notify({
    userIds: masters.map((m) => m.id),
    type: "testimonial.submitted",
    title: `Testimonial to review: ${c.title}`,
    body: `${d.authorName} (${d.organization}): “${d.quote.slice(0, 140)}”`,
    link: "/admin/testimonials",
  });
  return t;
}

export async function eventTestimonialsForOrganizer(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.edit");
  return db.testimonial.findMany({ where: { competitionId }, orderBy: { createdAt: "desc" } });
}

export const homepageTestimonials = () =>
  db.testimonial.findMany({ where: { published: true, featured: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], take: 6 });

export const eventTestimonials = (competitionId: string) =>
  db.testimonial.findMany({ where: { competitionId, published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
