// Local development PostgreSQL without Docker or a system install.
// Uses the `embedded-postgres` package (real PostgreSQL binaries shipped via npm).
// Usage: node scripts/dev-db.mjs            -> starts and keeps running (Ctrl+C to stop)
// Production must use a managed PostgreSQL instance (see docs/DEPLOYMENT.md).
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.env.OMNIHACK_PG_DIR ?? ".data/pg");
const port = Number(process.env.OMNIHACK_PG_PORT ?? 5433);
const databases = ["omnihack_dev", "omnihack_test"];

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "omnihack",
  password: "omnihack",
  port,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error("[postgres]", String(e).trim()),
});

const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) {
  console.log(`[dev-db] initialising cluster in ${dataDir}`);
  await pg.initialise();
}
await pg.start();
for (const db of databases) {
  try {
    await pg.createDatabase(db);
    console.log(`[dev-db] created database ${db}`);
  } catch {
    // already exists
  }
}
console.log(`[dev-db] PostgreSQL ready on postgresql://omnihack:omnihack@localhost:${port}/omnihack`);

const stop = async () => {
  console.log("\n[dev-db] stopping PostgreSQL…");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
