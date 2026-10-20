import { expect, test } from "@playwright/test";

test.describe("public website @mobile", () => {
  test("homepage explains the product and routes visitors", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("winning projects");
    await expect(page.getByRole("link", { name: /Explore competitions/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Host a competition/ }).first()).toBeVisible();
    await expect(page.getByText("Pitch the idea. Prove the impact.")).toBeVisible();
  });

  test("competition discovery uses shareable URL filters", async ({ page }) => {
    await page.goto("/competitions?type=HACKATHON");
    await expect(page.getByRole("heading", { name: /Climate Code Hackathon/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Smart Campus Ideathon/ })).toHaveCount(0);
    await page.goto("/competitions?q=campus");
    await expect(page.getByRole("heading", { name: /Smart Campus Ideathon/ })).toBeVisible();
  });

  test("competition detail page shows the required sections", async ({ page }) => {
    await page.goto("/competitions/smart-campus-ideathon-demo");
    for (const h of ["Overview", "Themes & problem statements", "Timeline & stages", "Prizes & awards", "Judging criteria", "Rules & policies"]) {
      await expect(page.getByRole("heading", { name: h })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Register now" })).toBeVisible();
  });

  test("drafts and private records are not public", async ({ page }) => {
    const res = await page.goto("/competitions/fintech-sprint-draft-demo");
    expect(res?.status()).toBe(404);
  });

  test("certificate verification handles unknown IDs", async ({ page }) => {
    await page.goto("/verify");
    await page.getByLabel("Certificate ID").fill("OH-2222-3333-4444");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("heading", { name: "Certificate not found" })).toBeVisible();
  });

  test("protected areas redirect to sign-in", async ({ page }) => {
    await page.goto("/organizer");
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Forganizer/);
  });
});
