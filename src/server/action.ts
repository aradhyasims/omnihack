// Wraps server-action bodies: converts domain errors into form state, keeps Next.js redirects working,
// and never leaks internal error details (database errors become a generic, logged message).
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { isAppError } from "./errors";

export async function runAction(fn: () => Promise<string | void | { message?: string; data?: Record<string, unknown> }>): Promise<ActionState> {
  try {
    const r = await fn();
    if (typeof r === "string") return { ok: true, message: r, ts: Date.now() };
    return { ok: true, message: r?.message, data: r?.data, ts: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    if (isAppError(e)) return { ok: false, error: e.message, fieldErrors: e.fieldErrors, ts: Date.now() };
    const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(`[action:${ref}]`, e);
    return { ok: false, error: `Something went wrong on our side and nothing was saved. Please try again. (Ref ${ref})`, ts: Date.now() };
  }
}
