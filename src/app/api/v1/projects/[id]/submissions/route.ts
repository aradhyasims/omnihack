import type { NextRequest } from "next/server";
import { api, ok } from "@/server/api";
import { notFound, unauthenticated } from "@/server/errors";
import { getProjectSubmissions, signedFileUrl } from "@/server/modules/submissions/service";

/** Submissions of a project — only for its members, assigned judges/mentors and authorized staff. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return api(async ({ actor }) => {
    if (!actor) throw unauthenticated();
    const p = await getProjectSubmissions(actor, id);
    if (!p) throw notFound("Project");
    return ok({
      id: p.id,
      title: p.title,
      submissions: p.submissions.map((s) => ({
        stage: s.stage.name,
        status: s.status,
        version: s.version,
        submittedAt: s.submittedAt,
        isLate: s.isLate,
        content: s.content,
        attachments: s.attachments.map((a) => ({
          id: a.id,
          field: a.fieldKey,
          fileName: a.fileName,
          sizeBytes: a.sizeBytes,
          scanStatus: a.scanStatus,
          url: signedFileUrl(a.id),
        })),
      })),
    });
  })(req);
}
