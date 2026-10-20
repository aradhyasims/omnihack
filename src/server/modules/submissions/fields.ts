// Submission field catalog. Each stage chooses a template (IDEA or PROJECT) and may enable/disable
// fields and toggle "required" per field via Stage.submissionFields — no code change per event.
import type { SubmissionTemplate } from "@prisma/client";

export type FieldType = "text" | "textarea" | "url" | "file" | "images" | "checkbox";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  maxLength?: number;
  defaultRequired: boolean;
  defaultEnabled: boolean;
};

const t = (key: string, label: string, type: FieldType, defaultRequired: boolean, help?: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  key,
  label,
  type,
  help,
  defaultRequired,
  defaultEnabled: true,
  maxLength: type === "text" ? 200 : type === "textarea" ? 5000 : type === "url" ? 500 : undefined,
  ...extra,
});

export const IDEA_FIELDS: FieldDef[] = [
  t("title", "Idea title", "text", true),
  t("problemStatement", "Problem statement", "textarea", true, "What problem are you solving, and what evidence shows it matters?"),
  t("targetUsers", "Target users or beneficiaries", "textarea", true),
  t("proposedSolution", "Proposed solution", "textarea", true),
  t("innovation", "Innovation and differentiation", "textarea", true, "How is this different from existing solutions?"),
  t("feasibility", "Feasibility", "textarea", false),
  t("impact", "Potential impact", "textarea", true),
  t("implementationPlan", "Implementation plan", "textarea", false),
  t("resourcesRequired", "Resources required", "textarea", false),
  t("risks", "Risks and constraints", "textarea", false),
  t("pitchDeck", "Pitch deck", "file", false, "PDF or PPTX."),
  t("conceptVideoUrl", "Concept video URL (optional)", "url", false),
  t("supportingDocuments", "Supporting documents (optional)", "file", false),
];

export const PROJECT_FIELDS: FieldDef[] = [
  t("title", "Project title", "text", true),
  t("description", "Project description", "textarea", true),
  t("problemAddressed", "Problem addressed", "textarea", true),
  t("proposedSolution", "Solution", "textarea", true),
  t("repoUrl", "Source repository URL", "url", true, "Link to GitHub, GitLab or similar. Private repos must grant judges access."),
  t("demoUrl", "Live demo URL", "url", false),
  t("demoVideoUrl", "Demo video URL", "url", false),
  t("pitchDeck", "Pitch deck", "file", false, "PDF or PPTX."),
  t("technicalDocs", "Technical documentation", "file", false),
  t("architecture", "System architecture", "textarea", false),
  t("prototypeImages", "Prototype images", "images", false, "PNG, JPG or WebP."),
  t("hardwareDetails", "Hardware details", "textarea", false, undefined, { defaultEnabled: false }),
  t("softwareDependencies", "Software dependencies", "textarea", false),
  t("deploymentInstructions", "Deployment instructions", "textarea", false),
  t("contributionSummary", "Team contribution summary", "textarea", false),
  t(
    "originalityDeclaration",
    "I confirm this submission is our original work, created for this competition, and that third-party components are disclosed.",
    "checkbox",
    true,
  ),
];

export function templateFields(template: SubmissionTemplate): FieldDef[] {
  return template === "IDEA" ? IDEA_FIELDS : template === "PROJECT" ? PROJECT_FIELDS : [];
}

export type FieldOverrides = Record<string, { enabled?: boolean; required?: boolean }>;

export type ResolvedField = FieldDef & { required: boolean };

/** Fields active for a stage after applying organizer overrides. */
export function resolveFields(template: SubmissionTemplate, overrides: unknown): ResolvedField[] {
  const o = (overrides && typeof overrides === "object" ? overrides : {}) as FieldOverrides;
  return templateFields(template)
    .filter((f) => o[f.key]?.enabled ?? f.defaultEnabled)
    .map((f) => ({ ...f, required: o[f.key]?.required ?? f.defaultRequired }));
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export type SubmissionContent = Record<string, string | boolean>;

/**
 * Validate text/url/checkbox values. `final` enforces required fields; drafts may be incomplete.
 * File presence is validated separately (needs attachment records).
 */
export function validateContent(
  fields: ResolvedField[],
  content: SubmissionContent,
  final: boolean,
  attachmentCounts: Record<string, number> = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = content[f.key];
    if (f.type === "file" || f.type === "images") {
      if (final && f.required && !(attachmentCounts[f.key] > 0)) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if (f.type === "checkbox") {
      if (final && f.required && v !== true) errors[f.key] = "This confirmation is required.";
      continue;
    }
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) {
      if (final && f.required) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if (f.maxLength && s.length > f.maxLength) errors[f.key] = `Keep this under ${f.maxLength} characters.`;
    if (f.type === "url" && !isHttpUrl(s)) errors[f.key] = "Enter a full URL starting with https://";
  }
  return errors;
}
