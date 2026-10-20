import type { NextRequest } from "next/server";
import { api, ok } from "@/server/api";
import { notFound } from "@/server/errors";
import { publicResults } from "@/server/modules/results/service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return api(async () => {
    const r = await publicResults(slug);
    if (!r) throw notFound("Published results");
    return ok({
      competition: { slug: r.competition.slug, title: r.competition.title, publishedAt: r.competition.resultsPublishedAt },
      winners: r.prizes.flatMap((p) => p.winners.map((w) => ({ prize: p.title, category: p.category, project: w.project.title, members: w.members }))),
      finalists: r.finalists.map((f) => ({ rank: f.stageResults[0]?.rank ?? null, project: f.title, team: f.team?.name ?? null })),
    });
  })(req);
}
