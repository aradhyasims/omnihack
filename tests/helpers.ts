// Integration-test helpers: clean database state and fixture builders that go through real services.
import { db } from "@/server/db";
import type { Actor } from "@/server/authz";
import { hashPassword } from "@/server/crypto";
import { resetRateLimits } from "@/server/rate-limit";

export async function resetDb() {
  if (!/_test\b/.test(process.env.DATABASE_URL ?? "")) throw new Error("resetDb only runs against the test database");
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  resetRateLimits();
}

let pw: string | null = null;
export async function makeUser(email: string, opts: { admin?: boolean; verified?: boolean; name?: string } = {}): Promise<Actor> {
  pw ??= await hashPassword("Correct-Horse-9");
  const u = await db.user.create({
    data: {
      email,
      name: opts.name ?? email.split("@")[0],
      passwordHash: pw,
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      platformRole: opts.admin ? "SUPER_ADMIN" : "USER",
      termsAcceptedAt: new Date(),
    },
  });
  return { id: u.id, email: u.email, name: u.name, platformRole: u.platformRole, status: u.status, emailVerifiedAt: u.emailVerifiedAt };
}

export const days = (n: number) => new Date(Date.now() + n * 86_400_000);

/** Format a Date as a datetime-local string in UTC (tests use timezone "UTC"). */
export const local = (d: Date) => d.toISOString().slice(0, 16);

export function file(name: string, content: Buffer | string, type = "application/octet-stream") {
  return new File([typeof content === "string" ? Buffer.from(content) : content], name, { type });
}

export const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
