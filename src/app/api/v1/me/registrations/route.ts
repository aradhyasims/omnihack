import { api, ok } from "@/server/api";
import { db } from "@/server/db";
import { unauthenticated } from "@/server/errors";

export const GET = api(async ({ actor }) => {
  if (!actor) throw unauthenticated();
  const regs = await db.registration.findMany({
    where: { userId: actor.id },
    select: {
      id: true,
      status: true,
      eligibilityStatus: true,
      createdAt: true,
      competition: { select: { slug: true, title: true, type: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok(regs);
});
