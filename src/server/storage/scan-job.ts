// Background job: scan one uploaded attachment and record the verdict.
import { db } from "../db";
import { audit } from "../audit";
import { notify } from "../notifications/notify";
import { storage } from "./index";
import { malwareScanner } from "./scanner";

export async function scanAttachment(attachmentId: string) {
  const att = await db.attachment.findUnique({
    where: { id: attachmentId },
    include: { submission: { include: { stage: { include: { competition: true } } } } },
  });
  if (!att || att.scanStatus !== "PENDING") return;
  const data = await storage().get(att.storageKey);
  const result = await malwareScanner().scan(data); // throws on scanner failure → job retries
  if (result.clean) {
    await db.attachment.update({ where: { id: att.id }, data: { scanStatus: "CLEAN" } });
    return;
  }
  // Infected: block downloads, remove the object, keep the record for audit.
  await db.attachment.update({ where: { id: att.id }, data: { scanStatus: "INFECTED" } });
  await storage()
    .delete(att.storageKey)
    .catch(() => {});
  const competition = att.submission.stage.competition;
  await audit({
    action: "file.infected",
    entityType: "Attachment",
    entityId: att.id,
    competitionId: competition.id,
    meta: { signature: result.signature, fileName: att.fileName, uploadedById: att.uploadedById },
  });
  await notify({
    userIds: [att.uploadedById],
    type: "file.infected",
    title: `A file you uploaded was blocked`,
    body: `"${att.fileName}" in ${competition.title} failed the malware scan and was removed. Please upload a clean copy.`,
    link: `/dashboard/competitions/${competition.slug}`,
    email: true,
    dedupeKey: `infected:${att.id}`,
  });
}

/** Background job: scan an uploaded CV (talent pool). Infected CVs are deleted and the owner notified. */
export async function scanResume(consentId: string) {
  const consent = await db.talentConsent.findUnique({ where: { id: consentId }, include: { competition: true } });
  if (!consent || !consent.resumeKey || consent.resumeScanStatus !== "PENDING") return;
  const result = await malwareScanner().scan(await storage().get(consent.resumeKey));
  if (result.clean) {
    await db.talentConsent.update({ where: { id: consentId }, data: { resumeScanStatus: "CLEAN" } });
    return;
  }
  await storage()
    .delete(consent.resumeKey)
    .catch(() => {});
  await db.talentConsent.update({ where: { id: consentId }, data: { resumeScanStatus: "INFECTED", resumeKey: null } });
  await audit({ action: "file.infected", entityType: "TalentConsent", entityId: consentId, competitionId: consent.competitionId, meta: { signature: result.signature, kind: "resume" } });
  await notify({
    userIds: [consent.userId],
    type: "file.infected",
    title: "Your CV upload was blocked",
    body: `The CV you uploaded for ${consent.competition.title} failed the malware scan and was removed. Please upload a clean PDF.`,
    link: `/dashboard/competitions/${consent.competition.slug}`,
    email: true,
    dedupeKey: `infected-resume:${consentId}`,
  });
}