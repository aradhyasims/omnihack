// Applies migrations to the dedicated test database before the suite runs.
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://omnihack:omnihack@localhost:5433/omnihack_test?schema=public";
  if (!/_test\b/.test(url)) throw new Error(`Refusing to run tests against a non-test database: ${url}`);
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
