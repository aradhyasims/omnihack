// Logical backup of every application table to a gzip'd JSON file (development / small installs).
// Production backups use managed PostgreSQL snapshots + point-in-time recovery and pg_dump — see docs/OPERATIONS.md.
// Usage: npx tsx scripts/backup.ts [outFile]
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const db = new PrismaClient();

async function main() {
  const out = process.argv[2] ?? path.join("backups", `omnihack-${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tables = await db.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const migrations = await db.$queryRaw<
    { migration_name: string }[]
  >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  const data: Record<string, unknown[]> = {};
  for (const { tablename } of tables) {
    const [row] = await db.$queryRawUnsafe<{ rows: unknown[] | null }[]>(`SELECT json_agg(t) AS rows FROM "${tablename}" t`);
    data[tablename] = row.rows ?? [];
  }
  const payload = JSON.stringify({
    format: "omnihack-logical-backup/v1",
    createdAt: new Date().toISOString(),
    migrations: migrations.map((m) => m.migration_name),
    tables: data,
  });
  const gz = zlib.gzipSync(payload);
  fs.writeFileSync(out, gz);
  const sha = crypto.createHash("sha256").update(gz).digest("hex");
  fs.writeFileSync(`${out}.sha256`, `${sha}  ${path.basename(out)}\n`);
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  console.log(JSON.stringify({ file: out, sha256: sha, tables: Object.keys(data).length, rows: Object.values(counts).reduce((a, b) => a + b, 0) }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
