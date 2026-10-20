import { describe, expect, it } from "vitest";
import { canTransition, discoveryPhase, registrationState, slugify, validateDates } from "@/server/modules/competitions/lifecycle";
import { evaluateEligibility, validateCustomAnswers } from "@/server/modules/registrations/service";

const now = new Date("2026-06-15T12:00:00Z");
const d = (iso: string) => new Date(iso);
const base = {
  status: "PUBLISHED" as const,
  registrationClosedManually: false,
  maxParticipants: null as number | null,
  registrationOpensAt: d("2026-06-01T00:00:00Z"),
  registrationClosesAt: d("2026-06-30T00:00:00Z"),
  teamFormationDeadline: null,
  startsAt: d("2026-07-01T00:00:00Z"),
  endsAt: d("2026-07-03T00:00:00Z"),
  resultsAt: null,
  certificatesAt: null,
};

describe("registrationState", () => {
  it("covers open, upcoming, closed, full, cancelled, completed and draft", () => {
    expect(registrationState(base, 0, now)).toBe("OPEN");
    expect(registrationState({ ...base, registrationOpensAt: d("2026-06-20T00:00:00Z") }, 0, now)).toBe("UPCOMING");
    expect(registrationState({ ...base, registrationClosesAt: d("2026-06-10T00:00:00Z") }, 0, now)).toBe("CLOSED");
    expect(registrationState({ ...base, registrationClosedManually: true }, 0, now)).toBe("CLOSED");
    expect(registrationState({ ...base, maxParticipants: 5 }, 5, now)).toBe("FULL");
    expect(registrationState({ ...base, status: "CANCELLED" }, 0, now)).toBe("CANCELLED");
    expect(registrationState({ ...base, status: "COMPLETED" }, 0, now)).toBe("COMPLETED");
    expect(registrationState({ ...base, status: "DRAFT" }, 0, now)).toBe("NOT_PUBLISHED");
  });
  it("discoveryPhase", () => {
    expect(discoveryPhase(base, now)).toBe("open");
    expect(discoveryPhase({ ...base, registrationClosesAt: d("2026-06-10T00:00:00Z") }, now)).toBe("ongoing");
    expect(discoveryPhase({ ...base, endsAt: d("2026-06-14T00:00:00Z") }, now)).toBe("completed");
  });
});

describe("validateDates", () => {
  it("accepts a consistent schedule", () => expect(validateDates(base)).toEqual({}));
  it("rejects impossible combinations", () => {
    expect(validateDates({ ...base, registrationClosesAt: d("2026-05-01T00:00:00Z") })).toHaveProperty("registrationClosesAt");
    expect(validateDates({ ...base, endsAt: d("2026-06-30T00:00:00Z") })).toHaveProperty("endsAt");
    expect(validateDates({ ...base, resultsAt: d("2026-07-01T00:00:00Z") })).toHaveProperty("resultsAt");
  });
});

describe("status transitions", () => {
  it("only allows documented transitions", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransition("ARCHIVED", "PUBLISHED")).toBe(false);
    expect(canTransition("CANCELLED", "PUBLISHED")).toBe(false);
  });
  it("slugify", () => expect(slugify("  Smart Cities: Hack 2026! ")).toBe("smart-cities-hack-2026"));
});

describe("eligibility", () => {
  const c = { eligibilityTypes: ["STUDENT"], minAge: 18, maxAge: 30, institutionRequirement: null, geoRestriction: "India, Nepal" };
  it("passes eligible participants", () => {
    expect(evaluateEligibility(c, { participantType: "STUDENT", institution: "X", country: "india", age: 20 })).toEqual([]);
  });
  it("explains every failed rule", () => {
    const reasons = evaluateEligibility(c, { participantType: "PROFESSIONAL", institution: null, country: "France", age: 40 });
    expect(reasons).toHaveLength(3);
  });
  it("does not ask for age unless configured", () => {
    expect(
      evaluateEligibility({ ...c, minAge: null, maxAge: null, geoRestriction: null }, { participantType: "STUDENT", institution: null, country: null }),
    ).toEqual([]);
  });
  it("validates custom answers", () => {
    const fields = [
      { key: "github", label: "GitHub", type: "text" as const, required: true },
      { key: "size", label: "Shirt", type: "select" as const, required: false, options: ["S", "M"] },
    ];
    expect(validateCustomAnswers(fields, { cf_size: "XL" }).errors).toHaveProperty("cf_github");
    expect(validateCustomAnswers(fields, { cf_size: "XL" }).errors).toHaveProperty("cf_size");
    expect(validateCustomAnswers(fields, { cf_github: "me", cf_size: "M" }).errors).toEqual({});
  });
});
