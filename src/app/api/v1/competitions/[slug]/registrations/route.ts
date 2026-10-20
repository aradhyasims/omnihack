import type { NextRequest } from "next/server";
import { api, ok } from "@/server/api";
import { db } from "@/server/db";
import { notFound, unauthenticated, validation } from "@/server/errors";
import { registerForCompetition } from "@/server/modules/registrations/service";

/** Register the signed-in user. Body: { participantType, institution?, country?, age?, acceptRules: true, mediaConsent?, cf_<key>? } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return api(
    async ({ actor }) => {
      if (!actor) throw unauthenticated();
      const c = await db.competition.findUnique({ where: { slug }, select: { id: true } });
      if (!c) throw notFound("Competition");
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw validation("Request body must be JSON.");
      }
      const reg = await registerForCompetition(actor, c.id, body);
      return ok({ id: reg.id, status: reg.status, eligibilityStatus: reg.eligibilityStatus }, undefined, 201);
    },
    { rate: [10, 60_000] },
  )(req);
}
