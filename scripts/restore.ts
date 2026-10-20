// Restore a logical backup produced by scripts/backup.ts into an EMPTY, migrated database.
// Usage: DATABASE_URL=<target> npx tsx scripts/restore.ts <backup.json.gz> [--verify]
// Safety: refuses to run if the target already contains users, and verifies the checksum first.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import zlib from "node:zlib";
import crypto from "node:crypto";

const db = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: restore.ts <backup.json.gz>");
  const gz = fs.readFileSync(file);
  const shaFile = `${file}.sha256`;
  if (fs.existsSync(shaFile)) {
    const expected = fs.readFileSync(shaFile, "utf8").split(/\s+/)[0];
    if (crypto.createHash("sha256").update(gz).digest("hex") !== expected) throw new Error("Checksum mismatch — backup file is corrupt.");
  }
  const backup = JSON.parse(zlib.gunzipSync(gz).toString("utf8")) as { format: string; migrations: string[]; tables: Record<string, unknown[]> };
  if (backup.format !== "omnihack-logical-backup/v1") throw new Error("Unknown backup format");
  const applied = (
    await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`
  ).map((m) => m.migration_name);
  if (JSON.stringify(applied) !== JSON.stringify(backup.migrations))
    throw new Error(`Schema mismatch. Target migrations: ${applied.join(",")}; backup: ${backup.migrations.join(",")}`);
  if ((await db.user.count()) > 0) throw new Error("Target database is not empty; refusing to restore over existing data.");

  await db.$transaction(
    async (tx) => {
      // Defer FK checks while loading tables in arbitrary order (requires a superuser/owner role).
      await tx.$executeRawUnsafe("SET session_replication_role = replica");
      for (const [table, rows] of Object.entries(backup.tables)) {
        if (!/^[A-Za-z_]+$/.test(table)) throw new Error(`Invalid table name ${table}`);
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = JSON.stringify(rows.slice(i, i + 500));
          await tx.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`, chunk);
        }
      }
      await tx.$executeRawUnsafe("SET session_replication_role = DEFAULT");
    },
    { timeout: 600_000 },
  );

  if (process.argv.includes("--verify")) {
    for (const [table, rows] of Object.entries(backup.tables)) {
      const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`);
      if (Number(n) !== rows.length) throw new Error(`Row count mismatch in ${table}: ${n} vs ${rows.length}`);
    }
    console.log(`Verified ${Object.keys(backup.tables).length} tables, ${Object.values(backup.tables).reduce((a, r) => a + r.length, 0)} rows.`);
  }
  console.log("Restore complete.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
