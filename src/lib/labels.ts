// Human-readable labels and badge tones for enum values (shared by server and client components).
import type { Tone } from "@/components/ui/primitives";

export const TYPE_LABEL: Record<string, string> = { IDEATHON: "Ideathon", HACKATHON: "Hackathon", HYBRID: "Ideathon → Hackathon" };
export const MODE_LABEL: Record<string, string> = { ONLINE: "Online", OFFLINE: "In person", HYBRID: "Hybrid" };
export const ELIGIBILITY_LABEL: Record<string, string> = { STUDENT: "Students", PROFESSIONAL: "Professionals", STARTUP: "Startups", OPEN: "Open to all" };
export const PARTICIPATION_LABEL: Record<string, string> = { INDIVIDUAL: "Individual", TEAM: "Teams", BOTH: "Individual or team" };

export const PHASE_META: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Registration open", tone: "success" },
  upcoming: { label: "Upcoming", tone: "info" },
  ongoing: { label: "In progress", tone: "brand" },
  completed: { label: "Completed", tone: "neutral" },
};

export const REG_STATE_META: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Registration open", tone: "success" },
  UPCOMING: { label: "Registration opens soon", tone: "info" },
  FULL: { label: "Registration full", tone: "warning" },
  CLOSED: { label: "Registration closed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  NOT_PUBLISHED: { label: "Not published", tone: "neutral" },
};

export const COMPETITION_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  PUBLISHED: { label: "Published", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "brand" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const STAGE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Not started", tone: "neutral" },
  OPEN: { label: "Open", tone: "success" },
  CLOSED: { label: "Closed", tone: "warning" },
  JUDGING: { label: "Judging", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "dark" },
};

export const REGISTRATION_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Under review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Not approved", tone: "danger" },
  WAITLISTED: { label: "Waitlisted", tone: "info" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

export const HOSTING_FEE_META: Record<string, { label: string; tone: Tone }> = {
  UNPAID: { label: "Fee unpaid", tone: "warning" },
  SUBMITTED: { label: "Verifying payment", tone: "info" },
  VERIFIED: { label: "Paid · enabled", tone: "success" },
  REJECTED: { label: "Payment not verified", tone: "danger" },
  WAIVED: { label: "Fee waived · enabled", tone: "success" },
};

export const PAYMENT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  NOT_REQUIRED: { label: "No fee", tone: "neutral" },
  PENDING: { label: "Payment due", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Payment not verified", tone: "danger" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export const DECISION_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  ADVANCED: { label: "Advanced", tone: "success" },
  NOT_ADVANCED: { label: "Not advanced", tone: "neutral" },
  DISQUALIFIED: { label: "Disqualified", tone: "danger" },
};

export const RESULTS_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  NONE: { label: "Not started", tone: "neutral" },
  PROVISIONAL: { label: "Provisional (private)", tone: "warning" },
  APPROVED: { label: "Approved — not public", tone: "info" },
  PUBLISHED: { label: "Published", tone: "success" },
};

export const CERT_LABEL: Record<string, string> = {
  PARTICIPANT: "Participation",
  FINALIST: "Finalist",
  WINNER: "Winner",
  MENTOR: "Mentor",
  JUDGE: "Judge",
  VOLUNTEER: "Volunteer",
  ORGANIZER: "Organizer",
};

export function formatFee(isPaid: boolean, minor: number, currency: string) {
  if (!isPaid || minor === 0) return "Free";
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);
}

export function eligibilitySummary(types: string[]) {
  if (!types.length || types.includes("OPEN")) return "Open to all";
  return types.map((t) => ELIGIBILITY_LABEL[t] ?? t).join(", ");
}

export function teamSummary(mode: string, min: number, max: number) {
  if (mode === "INDIVIDUAL") return "Individual";
  const size = min === max ? `${max}` : `${min}–${max}`;
  return mode === "BOTH" ? `Solo or teams of ${size}` : `Teams of ${size}`;
}

export const APPLICATION_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  SHORTLISTED: { label: "Shortlisted", tone: "info" },
  INTERVIEW_INVITED: { label: "Interview invited", tone: "warning" },
  INTERVIEW_ACCEPTED: { label: "Interview scheduled", tone: "brand" },
  OFFERED: { label: "Offer received", tone: "warning" },
  OFFER_ACCEPTED: { label: "Offer accepted", tone: "success" },
  OFFER_DECLINED: { label: "Offer declined", tone: "neutral" },
  NOT_SELECTED: { label: "Not selected", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};
