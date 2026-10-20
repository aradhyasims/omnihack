import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../../db";
import { audit } from "../../audit";
import { type Actor, getCompetitionAccess, requireActor } from "../../authz";
import { forbidden, notFound, precondition, validation } from "../../errors";
import { notify } from "../../notifications/notify";
import { storage } from "../../storage";
import { sanitizeFileName, validateUpload } from "../../storage/validate";
import { signPayload } from "../../crypto";
import { scannerEnabled } from "../../storage/scanner";
import { enqueueJob } from "../../jobs/queue";
import { recruiterCanViewProject } from "../talent/service";
import { isProjectEligibleForStage } from "../stages/service";
import { projectForUser, projectMemberIds } from "../teams/service";
import { resolveFields, type SubmissionContent, validateContent } from "./fields";

const MAX_FILES_PER_FIELD = 5;

export type SaveSubmissionInput = {
  stageId: string;
  values: Record<string, unknown>;
  files: Record<string, File[]>;
  removeAttachmentIds: string[];
  final: boolean;
};

export async function saveSubmission(actor: Actor | null, input: SaveSubmissionInput) {
  const a = requireActor(actor);
  const stage = await db.stage.findUnique({ where: { id: input.stageId }, include: { competition: true } });
  if (!stage || !stage.enabled) throw notFound("Stage");
  const project = await projectForUser(stage.competitionId, a.id);
  if (!project) throw precondition("Create or join a team (or start an individual project) before submitting.");
  if (project.status !== "ACTIVE") throw precondition("This project is no longer active in the competition.");
  if (!stage.acceptsSubmissions) throw precondition("This stage does not accept submissions.");
  if (stage.status !== "OPEN")
    throw precondition(stage.status === "PENDING" ? "Submissions for this stage have not opened yet." : "Submissions for this stage are closed.");
  const now = new Date();
  if (stage.startsAt && now < stage.startsAt) throw precondition("Submissions for this stage have not opened yet.");
  const isLate = Boolean(stage.endsAt && now > stage.endsAt);
  if (isLate && !stage.allowLateSubmissions) throw precondition("The submission deadline has passed.");
  if (!(await isProjectEligibleForStage(project.id, stage))) throw forbidden("Your project is not eligible for this stage.");

  const team = project.teamId ? await db.team.findUnique({ where: { id: project.teamId }, include: { members: true } }) : null;
  if (input.final) {
    const isOwner = team ? team.leaderId === a.id : project.ownerId === a.id;
    if (!isOwner) throw forbidden("Only the team leader can submit the final version. Members can save drafts.");
    if (team && team.members.length < stage.competition.minTeamSize) {
      throw precondition(`Your team needs at least ${stage.competition.minTeamSize} members to submit.`);
    }
  }

  const existing = await db.submission.findUnique({
    where: { projectId_stageId: { projectId: project.id, stageId: stage.id } },
    include: { attachments: { where: { deletedAt: null } } },
  });
  if (existing?.status === "SUBMITTED" && !input.final) {
    throw precondition("This stage was already submitted. Use “Submit updated version” to create a new version.");
  }

  const fields = resolveFields(stage.submissionTemplate, stage.submissionFields);
  const content: SubmissionContent = {};
  for (const f of fields) {
    if (f.type === "file" || f.type === "images") continue;
    const v = input.values[`field_${f.key}`];
    content[f.key] = f.type === "checkbox" ? v === "on" || v === "true" : typeof v === "string" ? v.trim() : "";
  }

  // Validate uploads before writing anything.
  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
  const pending: { fieldKey: string; name: string; mime: string; data: Buffer; sha: string }[] = [];
  const fileErrors: Record<string, string> = {};
  for (const f of fields.filter((x) => x.type === "file" || x.type === "images")) {
    const list = (input.files[f.key] ?? []).filter((file) => file && file.size > 0);
    const keep = existing?.attachments.filter((att) => att.fieldKey === f.key && !input.removeAttachmentIds.includes(att.id)).length ?? 0;
    if (keep + list.length > MAX_FILES_PER_FIELD) fileErrors[f.key] = `At most ${MAX_FILES_PER_FIELD} files for ${f.label}.`;
    for (const file of list) {
      const data = Buffer.from(await file.arrayBuffer());
      if (data.length !== file.size) {
        fileErrors[f.key] = `${file.name} was not fully uploaded. Please try again.`;
        continue;
      }
      const check = validateUpload(file.name, data, maxBytes, { imagesOnly: f.type === "images" });
      if (!check.ok) {
        fileErrors[f.key] = check.error;
        continue;
      }
      pending.push({ fieldKey: f.key, name: sanitizeFileName(file.name), mime: check.mime, data, sha: crypto.createHash("sha256").update(data).digest("hex") });
    }
  }
  const counts: Record<string, number> = {};
  for (const att of existing?.attachments ?? []) if (!input.removeAttachmentIds.includes(att.id)) counts[att.fieldKey] = (counts[att.fieldKey] ?? 0) + 1;
  for (const p of pending) counts[p.fieldKey] = (counts[p.fieldKey] ?? 0) + 1;
  const errors = { ...validateContent(fields, content, input.final, counts), ...fileErrors };
  if (Object.keys(errors).length)
    throw validation(input.final ? "Your submission is incomplete. Fix the highlighted fields." : "Please fix the highlighted fields.", errors);

  // Write files first; if the database transaction fails we delete them again.
  const written: string[] = [];
  const createdAttachmentIds: string[] = [];
  const store = storage();
  try {
    for (const p of pending) {
      const key = `submissions/${project.id}/${stage.id}/${crypto.randomUUID()}`;
      await store.put(key, p.data, p.mime);
      written.push(key);
      (p as typeof p & { key: string }).key = key;
    }
    const result = await db.$transaction(async (tx) => {
      const sub = existing
        ? await tx.submission.update({ where: { id: existing.id }, data: { content: content as Prisma.InputJsonValue } })
        : await tx.submission.create({ data: { projectId: project.id, stageId: stage.id, content: content as Prisma.InputJsonValue } });
      if (input.removeAttachmentIds.length) {
        await tx.attachment.updateMany({ where: { id: { in: input.removeAttachmentIds }, submissionId: sub.id }, data: { deletedAt: new Date() } });
      }
      for (const p of pending as ((typeof pending)[number] & { key: string })[]) {
        const att = await tx.attachment.create({
          data: {
            submissionId: sub.id,
            fieldKey: p.fieldKey,
            fileName: p.name,
            mimeType: p.mime,
            sizeBytes: p.data.length,
            storageKey: p.key,
            sha256: p.sha,
            scanStatus: scannerEnabled() ? "PENDING" : "NOT_SCANNED",
            uploadedById: a.id,
          },
        });
        createdAttachmentIds.push(att.id);
      }
      if (!input.final) return sub;
      const atts = await tx.attachment.findMany({ where: { submissionId: sub.id, deletedAt: null }, select: { id: true } });
      const version = sub.version + 1;
      await tx.submissionVersion.create({
        data: { submissionId: sub.id, version, content: content as Prisma.InputJsonValue, attachmentIds: atts.map((x) => x.id), createdById: a.id },
      });
      const updated = await tx.submission.update({
        where: { id: sub.id },
        data: { status: "SUBMITTED", version, submittedAt: now, submittedById: a.id, isLate },
      });
      if (stage.submissionTemplate !== "NONE" && typeof content.title === "string" && content.title) {
        await tx.project.update({
          where: { id: project.id },
          data: { title: content.title.slice(0, 200), summary: String(content.description ?? content.proposedSolution ?? "").slice(0, 500) },
        });
      }
      await audit(
        {
          actorId: a.id,
          action: "submission.submitted",
          entityType: "Submission",
          entityId: sub.id,
          competitionId: stage.competitionId,
          meta: { version, isLate },
        },
        tx,
      );
      return updated;
    });
    if (scannerEnabled()) {
      for (const id of createdAttachmentIds) await enqueueJob("file.scan", { attachmentId: id });
    }
    if (input.final) {
      await notify({
        userIds: await projectMemberIds(project.id),
        type: "submission.received",
        title: `Submission received: ${stage.name}`,
        body: `Version ${result.version} of your submission for "${stage.name}" in ${stage.competition.title} was received on ${now.toUTCString()}${isLate ? " (after the deadline — the organizer allows late submissions and will see it marked as late)" : ""}.`,
        link: `/dashboard/competitions/${stage.competition.slug}`,
        email: true,
        dedupeKey: `submitted:${result.id}:v${result.version}`,
      });
    }
    return result;
  } catch (e) {
    await Promise.all(written.map((k) => store.delete(k).catch(() => {})));
    throw e;
  }
}

/**
 * Who may view a project's submissions: its members, staff with submission.view_all,
 * judges assigned to it (non-revoked, no declared conflict) and mentors assigned to it.
 */
export async function canViewProject(actor: Actor | null, projectId: string): Promise<boolean> {
  if (!actor) return false;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { competitionId: true, ownerId: true, teamId: true } });
  if (!project) return false;
  if (project.ownerId === actor.id) return true;
  if (project.teamId && (await db.teamMembership.findFirst({ where: { teamId: project.teamId, userId: actor.id } }))) return true;
  const access = await getCompetitionAccess(actor, project.competitionId);
  if (access.permissions.has("submission.view_all")) return true;
  if (await db.judgeAssignment.findFirst({ where: { projectId, judgeId: actor.id, status: { in: ["ASSIGNED", "IN_PROGRESS", "SUBMITTED"] } } })) return true;
  if (await db.mentorAssignment.findFirst({ where: { projectId, mentorId: actor.id } })) return true;
  // Hiring staff, only when a member opted in to share their portfolio with hiring partners.
  if (await recruiterCanViewProject(actor, projectId)) return true;
  return false;
}

export async function getProjectSubmissions(actor: Actor | null, projectId: string) {
  if (!(await canViewProject(actor, projectId))) throw forbidden("You do not have access to this project.");
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      challenge: { select: { title: true } },
      track: { select: { name: true } },
      team: { include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } },
      owner: { select: { id: true, name: true, email: true } },
      submissions: {
        include: {
          stage: { select: { id: true, name: true, order: true, submissionTemplate: true, submissionFields: true } },
          attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
          versions: { orderBy: { version: "desc" }, select: { version: true, createdAt: true, createdById: true } },
        },
        orderBy: { stage: { order: "asc" } },
      },
    },
  });
}

/** Why a file may not be downloaded yet (null = allowed). */
export function downloadBlockReason(att: { scanStatus: string }): { status: number; message: string } | null {
  if (att.scanStatus === "INFECTED") return { status: 451, message: "This file was blocked by malware scanning." };
  if (att.scanStatus === "PENDING") return { status: 423, message: "This file is still being scanned for malware. Try again in a minute." };
  return null;
}

/** Short-lived signed download link. The download route re-checks authorization as well. */
export function signedFileUrl(attachmentId: string, ttlSeconds = 600) {
  const { exp, sig } = signPayload(`file:${attachmentId}`, ttlSeconds);
  return `/api/v1/files/${attachmentId}?exp=${exp}&sig=${sig}`;
}
