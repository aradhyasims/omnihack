import { api, ok } from "@/server/api";
import { listPublicCompetitions } from "@/server/modules/competitions/queries";

export const GET = api(async ({ req }) => {
  const p = req.nextUrl.searchParams;
  const get = (k: string) => p.get(k)?.slice(0, 100) || undefined;
  const r = await listPublicCompetitions({
    q: get("q"),
    type: get("type"),
    mode: get("mode"),
    phase: get("phase"),
    category: get("category"),
    eligibility: get("eligibility"),
    participation: get("participation"),
    fee: get("fee"),
    deadline: get("deadline"),
    organizer: get("organizer"),
    page: Number(p.get("page")) || 1,
  });
  return ok(
    r.items.map((c) => ({
      slug: c.slug,
      title: c.title,
      tagline: c.tagline,
      type: c.type,
      mode: c.mode,
      category: c.category,
      organizer: c.organization.name,
      phase: c.phase,
      registration: c.registration,
      registrationOpensAt: c.registrationOpensAt,
      registrationClosesAt: c.registrationClosesAt,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      timezone: c.timezone,
      eligibility: c.eligibilityTypes,
      participationMode: c.participationMode,
      teamSize: { min: c.minTeamSize, max: c.maxTeamSize },
      isPaid: c.isPaid,
      isDemo: c.isDemo,
    })),
    { page: r.page, pageCount: r.pageCount, total: r.total },
  );
});
