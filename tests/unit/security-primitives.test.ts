import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decrypt,
  encrypt,
  friendlyCode,
  hashPassword,
  signPayload,
  totp,
  verifyPassword,
  verifySignedPayload,
  verifyTotp,
} from "@/server/crypto";
import { validateUpload, sanitizeFileName } from "@/server/storage/validate";
import { resolveFields, validateContent, isHttpUrl } from "@/server/modules/submissions/fields";
import { toCsv } from "@/server/modules/analytics/service";
import { zonedLocalToUtc, utcToZonedLocal } from "@/lib/time";
import { ORG_ROLE_GRANTS, COMPETITION_ROLE_GRANTS } from "@/server/authz";

describe("passwords", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashPassword("Correct-Horse-9");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totp(secret, 59_000)).toBe("287082");
    expect(totp(secret, 1_111_111_109_000)).toBe("081804");
    expect(verifyTotp(secret, "081804", 1_111_111_109_000 + 25_000)).toBe(true);
    expect(verifyTotp(secret, "000000", 59_000)).toBe(false);
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
});

describe("encryption & signatures", () => {
  it("round-trips AES-GCM and detects tampering", () => {
    const enc = encrypt("secret-seed");
    expect(decrypt(enc)).toBe("secret-seed");
    const parts = enc.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("signed payloads expire and cannot be reused for another id", () => {
    const { exp, sig } = signPayload("file:a", 60);
    expect(verifySignedPayload("file:a", exp, sig)).toBe(true);
    expect(verifySignedPayload("file:b", exp, sig)).toBe(false);
    expect(verifySignedPayload("file:a", Math.floor(Date.now() / 1000) - 1, sig)).toBe(false);
  });
  it("friendly codes are unambiguous", () => {
    expect(friendlyCode("OH")).toMatch(/^OH(-[2-9A-Z]{4}){3}$/);
    for (let i = 0; i < 50; i++) expect(friendlyCode("OH").slice(3)).not.toMatch(/[01IO]/);
  });
});

describe("upload validation", () => {
  const MB = 1024 * 1024;
  it("checks extension, size, emptiness and magic bytes", () => {
    expect(validateUpload("deck.pdf", Buffer.from("%PDF-1.7 ..."), MB)).toMatchObject({ ok: true, mime: "application/pdf" });
    expect(validateUpload("evil.exe", Buffer.from("MZ"), MB).ok).toBe(false);
    expect(validateUpload("fake.pdf", Buffer.from("MZ\x90\x00"), MB).ok).toBe(false);
    expect(validateUpload("empty.pdf", Buffer.alloc(0), MB).ok).toBe(false);
    expect(validateUpload("big.pdf", Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MB)]), MB).ok).toBe(false);
    expect(validateUpload("pic.pdf", Buffer.from("%PDF-1.7"), MB, { imagesOnly: true }).ok).toBe(false);
  });
  it("sanitizes file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('a<b>"c.pdf')).toBe("a_b_c.pdf");
  });
});

describe("submission fields", () => {
  it("ideathon template does not require a prototype or source code", () => {
    const idea = resolveFields("IDEA", {});
    expect(idea.some((f) => f.key === "repoUrl")).toBe(false);
    expect(idea.find((f) => f.key === "pitchDeck")?.required).toBe(false);
  });
  it("organizer overrides enable/require fields", () => {
    const f = resolveFields("PROJECT", { demoUrl: { enabled: true, required: true }, architecture: { enabled: false } });
    expect(f.find((x) => x.key === "demoUrl")?.required).toBe(true);
    expect(f.some((x) => x.key === "architecture")).toBe(false);
  });
  it("drafts may be incomplete; finals may not; urls must be http(s)", () => {
    const f = resolveFields("PROJECT", {});
    expect(validateContent(f, { title: "x" }, false)).toEqual({});
    expect(Object.keys(validateContent(f, { title: "x" }, true))).toEqual(expect.arrayContaining(["description", "repoUrl", "originalityDeclaration"]));
    expect(validateContent(f, { repoUrl: "javascript:alert(1)" }, false)).toHaveProperty("repoUrl");
    expect(isHttpUrl("https://github.com/x")).toBe(true);
  });
});

describe("csv export", () => {
  it("escapes quotes/commas and neutralises formula injection", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(1)", 'he said "hi", ok']]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"he said ""hi"", ok"');
  });
});

describe("timezones", () => {
  it("converts wall-clock times in an IANA zone to UTC and back", () => {
    const d = zonedLocalToUtc("2026-03-01T09:30", "Asia/Kolkata")!;
    expect(d.toISOString()).toBe("2026-03-01T04:00:00.000Z");
    expect(utcToZonedLocal(d, "Asia/Kolkata")).toBe("2026-03-01T09:30");
    expect(zonedLocalToUtc("2026-07-01T12:00", "America/New_York")!.toISOString()).toBe("2026-07-01T16:00:00.000Z"); // DST
  });
});

describe("role grants", () => {
  it("coordinators cannot approve results (separation of duties); auditors are read-only", () => {
    expect(ORG_ROLE_GRANTS.COORDINATOR.has("results.approve")).toBe(false);
    expect(ORG_ROLE_GRANTS.OWNER.has("results.approve")).toBe(true);
    expect(COMPETITION_ROLE_GRANTS.OWNER.has("results.approve")).toBe(false);
    expect(COMPETITION_ROLE_GRANTS.OWNER.has("results.publish")).toBe(true);
    expect(COMPETITION_ROLE_GRANTS.AUDITOR.has("competition.edit")).toBe(false);
    expect(COMPETITION_ROLE_GRANTS.AUDITOR.has("audit.view")).toBe(true);
    expect(COMPETITION_ROLE_GRANTS.JUDGE.size).toBe(0);
  });
});
