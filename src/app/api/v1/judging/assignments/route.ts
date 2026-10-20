import { api, ok } from "@/server/api";
import { unauthenticated } from "@/server/errors";
import { myAssignments } from "@/server/modules/judging/service";

export const GET = api(async ({ actor }) => {
  if (!actor) throw unauthenticated();
  const rows = await myAssignments(actor);
  return ok(
    rows.map((a) => ({
      id: a.id,
      status: a.status,
      dueAt: a.dueAt,
      stage: { id: a.stage.id, name: a.stage.name, status: a.stage.status },
      competition: { slug: a.stage.competition.slug, title: a.stage.competition.title },
      project: { id: a.project.id, title: a.project.title },
      evaluation: a.evaluation ? { status: a.evaluation.status, totalScore: a.evaluation.totalScore } : null,
    })),
  );
});
