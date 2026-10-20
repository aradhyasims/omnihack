import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  competitionId?: string | null;
  organizationId?: string | null;
  meta?: Prisma.InputJsonValue;
  ipHash?: string | null;
};

/** Append-only audit log. Pass a transaction client so the entry commits with the change it records. */
export async function audit(entry: AuditEntry, client: Tx | typeof db = db) {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      competitionId: entry.competitionId ?? null,
      organizationId: entry.organizationId ?? null,
      meta: entry.meta ?? {},
      ipHash: entry.ipHash ?? null,
    },
  });
}
