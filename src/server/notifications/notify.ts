import { db } from "../db";
import { enqueueJob } from "../jobs/queue";
import { queueEmail } from "./email";

export type NotifyInput = {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  link?: string;
  email?: boolean;
  /** Base key; the per-user key `${dedupeKey}:${userId}` prevents duplicate messages. */
  dedupeKey?: string;
};

const INLINE_LIMIT = 25;

/**
 * Create in-app notifications (and optionally emails) for users.
 * Large audiences are fanned out by a background job so requests are not blocked.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return;
  if (userIds.length > INLINE_LIMIT) {
    await enqueueJob("notify.fanout", { ...input, userIds });
    return;
  }
  await deliverNotifications({ ...input, userIds });
}

export async function deliverNotifications(input: NotifyInput) {
  const users = await db.user.findMany({
    where: { id: { in: input.userIds }, status: "ACTIVE" },
    select: { id: true, email: true },
  });
  await db.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${u.id}` : undefined,
    })),
    skipDuplicates: true,
  });
  if (input.email) {
    for (const u of users) {
      await queueEmail({
        to: u.email,
        subject: input.title,
        body: input.body,
        ctaLabel: input.link ? "View on OmniHack" : undefined,
        ctaUrl: input.link,
        dedupeKey: input.dedupeKey ? `email:${input.dedupeKey}:${u.id}` : undefined,
      });
    }
  }
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
