// Tiny per-instance TTL cache for expensive, non-personal public reads (homepage sections, filter
// lists). Keeps real Date objects (unlike JSON-serialising caches). Concurrent callers share one
// in-flight promise, so a cold cache does not stampede the database.
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    store.delete(key); // never cache failures
    throw e;
  });
  store.set(key, { expires: now + ttlMs, value });
  return value;
}

export function clearCache(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
