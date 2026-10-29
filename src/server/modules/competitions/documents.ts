// Public event documents uploaded by organizers: the event catalog/brochure (any time) and the final report
// (only once the event has ended). Both are public, so they're stored under the public/ prefix and served by /media.
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, requireCompetitionPermission } from "../../authz";
import { precondition, validation } from "../../errors";
import { storage } from "../../storage";
import { sanitizeFileName, validateUpload } from "../../storage/validate";
import { randomToken } from "../../crypto";

export type EventDocumentKind = "catalog" | "report";

const LIMITS: Record<EventDocumentKind, { maxBytes: number; label: string }> = {
  catalog: { maxBytes: 10 * 1024 * 1024, label: "Event catalog" },
  report: { maxBytes: 20 * 1024 * 1024, label: "Final report" },
};
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png"]);

/** The event has ended when its end date has passed or it was completed/archived. */
export function eventHasEnded(c: { endsAt: Date | null; status: string }) {
  return c.status === "COMPLETED" || c.status === "ARCHIVED" || (c.endsAt != null && c.endsAt.getTime() <= Date.now());
}

export async function setEventDocument(actor: Actor | null, competitionId: string, kind: EventDocumentKind, file: File | null) {
  await requireCompetitionPermission(actor, competitionId, "competition.edit");
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const keyField = kind === "catalog" ? "catalogKey" : "reportKey";
  const nameField = kind === "catalog" ? "catalogName" : "reportName";
  const previous = c[keyField];

  if (!file || file.size === 0) {
    await db.competition.update({
      where: { id: competitionId },
      data: { [keyField]: null, [nameField]: null, ...(kind === "report" ? { reportUploadedAt: null } : {}) },
    });
  } else {
    if (kind === "report" && !eventHasEnded(c)) throw precondition("The final report can be uploaded once the event has ended.");
    const { maxBytes, label } = LIMITS[kind];
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw validation(`${label} must be a PDF, JPG or PNG file.`, { [kind]: "PDF, JPG or PNG only." });
    const buf = Buffer.from(await file.arrayBuffer());
    const check = validateUpload(file.name, buf, maxBytes);
    if (!check.ok) throw validation(check.error, { [kind]: check.error });
    const key = `public/competitions/${c.id}/${kind}-${randomToken(8)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "x")}.${check.ext}`;
    await storage().put(key, buf, check.mime);
    await db.competition.update({
      where: { id: competitionId },
      data: { [keyField]: key, [nameField]: sanitizeFileName(file.name), ...(kind === "report" ? { reportUploadedAt: new Date() } : {}) },
    });
  }
  if (previous)
    await storage()
      .delete(previous)
      .catch(() => {});
  await audit({
    actorId: actor!.id,
    action: `competition.${kind}_${file && file.size > 0 ? "uploaded" : "removed"}`,
    entityType: "Competition",
    entityId: competitionId,
    competitionId,
  });
}
