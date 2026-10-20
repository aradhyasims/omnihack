import type { NextRequest } from "next/server";
import { api, ok } from "@/server/api";
import { notFound } from "@/server/errors";
import { verifyCertificate } from "@/server/modules/certificates/service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return api(
    async () => {
      const r = await verifyCertificate(code);
      if (!r) throw notFound("Certificate");
      return ok(r);
    },
    { rate: [30, 60_000] },
  )(req);
}
