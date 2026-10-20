// Pure lifecycle rules for competitions (no I/O) — unit tested in tests/unit/lifecycle.test.ts.
import type { CompetitionStatus } from "@prisma/client";

export type DateFields = {
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  teamFormationDeadline: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  resultsAt: Date | null;
  certificatesAt: Date | null;
};

export type RegistrationState = "NOT_PUBLISHED" | "UPCOMING" | "OPEN" | "FULL" | "CLOSED" | "CANCELLED" | "COMPLETED";

export function registrationState(
  c: DateFields & { status: CompetitionStatus; registrationClosedManually: boolean; maxParticipants: number | null },
  activeRegistrations: number,
  now = new Date(),
): RegistrationState {
  if (c.status === "CANCELLED") return "CANCELLED";
  if (c.status === "COMPLETED" || c.status === "ARCHIVED") return "COMPLETED";
  if (c.status !== "PUBLISHED") return "NOT_PUBLISHED";
  if (c.endsAt && c.endsAt <= now) return "COMPLETED";
  if (c.registrationOpensAt && c.registrationOpensAt > now) return "UPCOMING";
  if (c.registrationClosedManually) return "CLOSED";
  if (c.registrationClosesAt && c.registrationClosesAt <= now) return "CLOSED";
  if (c.maxParticipants != null && activeRegistrations >= c.maxParticipants) return "FULL";
  return "OPEN";
}

export type Phase = "upcoming" | "open" | "ongoing" | "completed";

export function discoveryPhase(c: DateFields & { status: CompetitionStatus; registrationClosedManually: boolean }, now = new Date()): Phase {
  if (c.status === "COMPLETED" || c.status === "ARCHIVED" || (c.endsAt && c.endsAt <= now)) return "completed";
  if (c.registrationOpensAt && c.registrationOpensAt > now) return "upcoming";
  if (!c.registrationClosedManually && (!c.registrationClosesAt || c.registrationClosesAt > now)) return "open";
  return "ongoing";
}

/** Returns field-keyed errors for impossible date combinations. */
export function validateDates(d: DateFields): Record<string, string> {
  const e: Record<string, string> = {};
  const lt = (a: Date | null, b: Date | null) => a && b && a.getTime() >= b.getTime();
  if (lt(d.registrationOpensAt, d.registrationClosesAt)) e.registrationClosesAt = "Registration must close after it opens.";
  if (lt(d.startsAt, d.endsAt)) e.endsAt = "The event must end after it starts.";
  if (d.registrationClosesAt && d.endsAt && d.registrationClosesAt > d.endsAt) e.registrationClosesAt = "Registration cannot close after the event ends.";
  if (d.registrationOpensAt && d.startsAt && d.registrationOpensAt > d.startsAt) e.registrationOpensAt = "Registration should open before the event starts.";
  if (d.teamFormationDeadline) {
    if (d.registrationOpensAt && d.teamFormationDeadline < d.registrationOpensAt)
      e.teamFormationDeadline = "Team formation deadline must be after registration opens.";
    if (d.endsAt && d.teamFormationDeadline > d.endsAt) e.teamFormationDeadline = "Team formation must close before the event ends.";
  }
  if (d.resultsAt && d.endsAt && d.resultsAt < d.endsAt) e.resultsAt = "Results cannot be published before the event ends.";
  if (d.certificatesAt && d.resultsAt && d.certificatesAt < d.resultsAt) e.certificatesAt = "Certificates should be available on or after result publication.";
  return e;
}

/** Allowed manual status transitions (publishing additionally requires validation and approval rules). */
export const STATUS_TRANSITIONS: Record<CompetitionStatus, CompetitionStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "PUBLISHED", "CANCELLED"],
  PENDING_APPROVAL: ["PUBLISHED", "DRAFT"],
  PUBLISHED: ["DRAFT", "CANCELLED", "COMPLETED"],
  CANCELLED: ["ARCHIVED"],
  COMPLETED: ["ARCHIVED", "PUBLISHED"],
  ARCHIVED: [],
};

export function canTransition(from: CompetitionStatus, to: CompetitionStatus) {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const RULE_KEYS = [
  ["originality", "Originality"],
  ["intellectualProperty", "Intellectual property"],
  ["licensing", "Code & content licensing"],
  ["conduct", "Participant conduct"],
  ["privacy", "Data privacy"],
  ["disqualification", "Disqualification"],
  ["conflictsOfInterest", "Conflicts of interest"],
  ["appeals", "Appeals & result disputes"],
  ["mediaConsent", "Media consent"],
] as const;

export type RuleKey = (typeof RULE_KEYS)[number][0];

/** Neutral starting text organizers are expected to review and adapt. */
export const DEFAULT_RULES: Record<RuleKey, string> = {
  originality:
    "All submissions must be the original work of the registered participants, created for this competition. Use of open-source libraries, public datasets and AI tools is permitted when clearly disclosed.",
  intellectualProperty:
    "Participants retain ownership of the intellectual property they create unless a separate written agreement states otherwise. The organizer may display submitted titles and summaries for judging and, with consent, in the public showcase.",
  licensing: "Code submitted via public repositories should include a license file. Third-party components must be used in accordance with their licenses.",
  conduct:
    "Participants, mentors, judges and staff must treat one another with respect. Harassment, discrimination and disruptive behaviour are not tolerated and may lead to removal.",
  privacy:
    "Personal data collected for this competition is used only to run the event, as described in the OmniHack privacy notice. Judges see only what is needed to evaluate submissions.",
  disqualification:
    "Entries may be disqualified for plagiarism, misrepresentation, breaching eligibility rules, missing mandatory submissions, or violating the code of conduct. Decisions are recorded with reasons.",
  conflictsOfInterest:
    "Judges and mentors must declare any personal or professional relationship with a team. Judges with a declared conflict are not assigned to that team's entry.",
  appeals:
    "Concerns about results can be raised through the competition contact within 7 days of publication. The organizer will review the recorded evaluations and respond in writing.",
  mediaConsent: "Photographs or recordings may be taken at in-person sessions. Participants can opt out of media use during registration.",
};
