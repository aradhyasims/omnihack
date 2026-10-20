import type { NextRequest } from "next/server";
import { api } from "@/server/api";
import { exportCsv } from "@/server/modules/analytics/service";
import { notFound, unauthenticated } from "@/server/errors";

const KINDS = ["registrations", "teams", "submissions", "rankings", "attendance"] as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await ctx.params;
  return api(
    async ({ actor }) => {
      if (!actor) throw unauthenticated();
      if (!KINDS.includes(kind as (typeof KINDS)[number])) throw notFound("Export");
      const csv = await exportCsv(actor, id, kind as (typeof KINDS)[number]);
      return new Response("﻿" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="omnihack-${kind}-${id}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    },
    { rate: [30, 60_000] },
  )(req);
}
