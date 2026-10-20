// Capture page screenshots for visual review: node scripts/screenshots.mjs <outDir> <path> [path...]
// Optional env: SHOT_WIDTH (default 1366), SHOT_LOGIN=email:password to sign in first, BASE_URL.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [outDir, ...paths] = process.argv.slice(2);
if (!outDir || !paths.length) {
  console.error("usage: node scripts/screenshots.mjs <outDir> <path> [path...]");
  process.exit(1);
}
const base = process.env.BASE_URL ?? "http://localhost:3000";
const width = Number(process.env.SHOT_WIDTH ?? 1366);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

if (process.env.SHOT_LOGIN) {
  const [email, password] = process.env.SHOT_LOGIN.split(":");
  await page.goto(`${base}/auth/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
}

for (const p of paths) {
  const res = await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 120000 });
  const file = path.join(outDir, `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`${res?.status()} ${p} -> ${file}`);
}
if (errors.length) console.log("page errors:", errors);
await browser.close();
