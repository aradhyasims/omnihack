// In-memory sliding-window rate limiter. Adequate for a single instance; for multiple
// instances put AWS WAF rate rules in front and/or back this with a shared cache (see docs/SECURITY.md).
import { AppError } from "./errors";

const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  }
}

export function resetRateLimits() {
  buckets.clear();
}
