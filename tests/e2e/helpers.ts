import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();
export const DEMO_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "OmniHack!Demo2026";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
}

/** Sign up a fresh account and verify its email using the link from the (console) email outbox. */
export async function signUpVerified(page: Page, name: string) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}@test.example`;
  await page.goto("/auth/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2e-Strong-Pass-1");
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("Verify your email address")).toBeVisible();
  const mail = await db.emailOutbox.findFirstOrThrow({ where: { toEmail: email, subject: { startsWith: "Verify" } }, orderBy: { createdAt: "desc" } });
  const link = /\/auth\/verify-email\?token=[\w-]+/.exec(mail.text)![0];
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  return email;
}
