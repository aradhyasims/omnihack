// Durable Postgres-backed job queue (FOR UPDATE SKIP LOCKED makes it safe for multiple workers).
// On AWS the same interface can be backed by SQS; see docs/ARCHITECTURE.md.
import type { Job, Prisma } from "@prisma/client";
import { db } from "../db";

export async function enqueueJob(type: string, payload: Prisma.InputJsonValue, runAt = new Date()) {
  return db.job.create({ data: { type, payload, runAt } });
}

export type JobHandler = (payload: unknown) => Promise<void>;

/** Claim and run due jobs. Failed jobs are retried with exponential backoff. */
export async function runDueJobs(handlers: Record<string, JobHandler>, limit = 10): Promise<number> {
  const claimed = await db.$queryRaw<Job[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE status = 'QUEUED' AND "runAt" <= now()
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
  for (const job of claimed) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler registered for job type ${job.type}`);
      await handler(job.payload);
      await db.job.update({ where: { id: job.id }, data: { status: "DONE", lastError: null } });
    } catch (e) {
      const exhausted = job.attempts >= job.maxAttempts;
      await db.job.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "FAILED" : "QUEUED",
          lastError: String(e instanceof Error ? e.message : e).slice(0, 500),
          runAt: new Date(Date.now() + Math.min(2 ** job.attempts * 15_000, 3_600_000)),
        },
      });
    }
  }
  // Recover jobs stuck in RUNNING (worker crashed) after 10 minutes.
  await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "QUEUED" },
  });
  return claimed.length;
}
