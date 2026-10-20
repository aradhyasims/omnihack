// Shared zod helpers for parsing HTML form input (empty strings, checkboxes, lists).
import { z, ZodError } from "zod";
import { validation } from "./errors";
import { zonedLocalToUtc } from "@/lib/time";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optText = (max = 5000) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional()).transform((v) => v ?? null);
export const reqText = (label: string, min = 1, max = 5000) =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(min, `${label} is required.`)
    .max(max, `${label} is too long.`);
export const optUrl = z
  .preprocess(emptyToUndefined, z.string().trim().url("Enter a full URL starting with https://").max(500).optional())
  .refine((v) => !v || /^https?:\/\//i.test(v), "Only http(s) links are allowed.")
  .transform((v) => v ?? null);
export const optEmail = z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email("Enter a valid email.").optional()).transform((v) => v ?? null);
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const optInt = (min = 0, max = 1_000_000) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional()).transform((v) => v ?? null);
export const intWithDefault = (def: number, min = 0, max = 1_000_000) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional()).transform((v) => v ?? def);
export const csvList = z
  .preprocess((v) => (Array.isArray(v) ? v.join(",") : (v ?? "")), z.string())
  .transform((s) =>
    s
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50),
  );

/** datetime-local value interpreted in the given IANA timezone. */
export const zonedDate = (tz: string) =>
  z.preprocess(emptyToUndefined, z.string().optional()).transform((v, ctx) => {
    if (!v) return null;
    const d = zonedLocalToUtc(v, tz);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
      return z.NEVER;
    }
    return d;
  });

/** Parse with zod and convert failures into a field-keyed AppError. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  try {
    return schema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = issue.path.join(".") || "_form";
        fieldErrors[key] ??= issue.message;
      }
      throw validation("Please correct the highlighted fields.", fieldErrors);
    }
    throw e;
  }
}

/** FormData → plain object (repeated keys become arrays). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).filter((v) => typeof v === "string");
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}
