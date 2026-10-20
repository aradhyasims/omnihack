// Provider-independent AI assistance interface. No provider is integrated in this build, so every
// feature reports a clear "unavailable" state. Rules for any future adapter:
//  - output is labelled as AI-generated and never replaces human judging decisions;
//  - confidential submissions are only sent to a provider with explicit organizer authorization;
//  - only operation metadata (feature, status, entity) is logged — never prompts or private content.
import { db } from "../../db";
import { features } from "../../env";

export type AiFeature =
  "submission_summary" | "rubric_assist" | "similarity_flag" | "team_matching" | "challenge_classification" | "project_discovery" | "report_summary";

export interface AiProvider {
  readonly name: string;
  complete(prompt: string, opts: { maxTokens: number }): Promise<string>;
}

export function aiStatus(): { available: false; reason: string } {
  return features.ai()
    ? { available: false, reason: `AI provider "${process.env.AI_PROVIDER}" is configured, but no adapter is implemented in this build.` }
    : { available: false, reason: "AI assistance is not configured on this platform." };
}

export async function runAiFeature(feature: AiFeature, actorId: string, entity: { type: string; id: string }) {
  const status = aiStatus();
  await db.aiOperation.create({
    data: { feature, provider: process.env.AI_PROVIDER || "none", status: "UNAVAILABLE", actorId, entityType: entity.type, entityId: entity.id },
  });
  return { ok: false as const, label: "AI-generated (unavailable)", message: status.reason };
}
