import type { NextRequest } from "next/server";
import { api, ok } from "@/server/api";
import { notFound } from "@/server/errors";
import { getCompetitionPage } from "@/server/modules/competitions/queries";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return api(async ({ actor }) => {
    const page = await getCompetitionPage(slug, actor);
    if (!page) throw notFound("Competition");
    const c = page.competition;
    return ok({
      slug: c.slug,
      title: c.title,
      tagline: c.tagline,
      description: c.description,
      type: c.type,
      mode: c.mode,
      status: c.status,
      registration: page.registration,
      organizer: { name: c.organization.name, verified: c.organization.verified },
      timezone: c.timezone,
      dates: {
        registrationOpensAt: c.registrationOpensAt,
        registrationClosesAt: c.registrationClosesAt,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        resultsAt: c.resultsAt,
      },
      eligibility: { types: c.eligibilityTypes, participationMode: c.participationMode, minTeamSize: c.minTeamSize, maxTeamSize: c.maxTeamSize },
      tracks: c.tracks.map((t) => ({ id: t.id, name: t.name })),
      challenges: c.challenges.map((ch) => ({ id: ch.id, title: ch.title, description: ch.description, track: ch.track?.name ?? null })),
      stages: c.stages.map((s) => ({ name: s.name, type: s.type, status: s.status, startsAt: s.startsAt, endsAt: s.endsAt })),
      prizes: c.prizes.map((p) => ({ title: p.title, category: p.category, value: p.valueText, valueVerified: p.valueVerified })),
      isDemo: c.isDemo,
    });
  })(req);
}
