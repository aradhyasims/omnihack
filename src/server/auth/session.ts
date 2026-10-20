// Database-backed sessions. The browser holds an opaque random token in an HTTP-only cookie;
// only its SHA-256 hash is stored, so a database leak does not expose usable sessions.
import { db } from "../db";
import { hashIp, randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = "oh_session";

function ttlMs() {
  return Number(process.env.SESSION_TTL_HOURS ?? 12) * 3_600_000;
}
function maxMs() {
  return Number(process.env.SESSION_MAX_DAYS ?? 14) * 86_400_000;
}

export async function createSession(userId: string, opts: { ip?: string | null; userAgent?: string | null; mfaVerified: boolean }) {
  const token = randomToken(32);
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + maxMs());
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      mfaVerified: opts.mfaVerified,
      expiresAt: new Date(now + ttlMs()),
      absoluteExpiresAt,
      ipHash: hashIp(opts.ip),
      userAgent: opts.userAgent?.slice(0, 200) ?? null,
    },
  });
  return { token, session, cookieExpires: absoluteExpiresAt };
}

/** Returns the session and user if valid; extends the sliding expiry (bounded by the absolute maximum). */
export async function validateSessionToken(token: string | undefined | null) {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          platformRole: true,
          status: true,
          emailVerifiedAt: true,
          mfaEnabledAt: true,
        },
      },
    },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  // Renew at most every 5 minutes to limit writes.
  if (now - session.lastSeenAt.getTime() > 5 * 60_000) {
    const expiresAt = new Date(Math.min(now + ttlMs(), session.absoluteExpiresAt.getTime()));
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt } });
  }
  return session;
}

export async function deleteSessionByToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function deleteUserSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}

export async function purgeExpiredSessions() {
  await db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { absoluteExpiresAt: { lt: new Date() } }] } });
}
