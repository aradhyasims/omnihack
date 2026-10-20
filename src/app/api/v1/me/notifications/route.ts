import { api, ok } from "@/server/api";
import { db } from "@/server/db";
import { unauthenticated } from "@/server/errors";
import { markNotificationsRead } from "@/server/notifications/notify";

export const GET = api(async ({ actor, req }) => {
  if (!actor) throw unauthenticated();
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const items = await db.notification.findMany({
    where: { userId: actor.id, ...(unreadOnly ? { readAt: null } : {}) },
    select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(items);
});

/** Mark notifications read. Body: { ids?: string[] } — omit ids to mark all. Idempotent. */
export const POST = api(async ({ actor, req }) => {
  if (!actor) throw unauthenticated();
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : undefined;
  await markNotificationsRead(actor.id, ids);
  return ok({ updated: true });
});
