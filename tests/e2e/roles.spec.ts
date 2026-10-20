import { expect, test } from "@playwright/test";
import { db, login } from "./helpers";

test.describe("organizer, judge and access control", () => {
  test("organizer creates a hackathon draft and edits it in the wizard", async ({ page }) => {
    await login(page, "organizer@omnihack.example");
    await page.goto("/organizer/competitions/new");
    await page.getByLabel("Event name").fill(`E2E Hack ${Date.now()}`);
    await page.getByRole("button", { name: "Create draft & continue" }).click();
    await page.waitForURL(/\/edit\?step=1/);
    await page.getByLabel("Short description").fill("An end-to-end test hackathon draft.");
    await page.getByLabel("Full description").fill("This draft was created by the Playwright suite to verify the creation wizard.");
    await page.getByRole("button", { name: "Save & continue →" }).click();
    await page.waitForURL(/step=2/);
    await page.getByRole("link", { name: "Publish" }).click();
    await expect(page.getByText("Before publishing:")).toBeVisible();
    await expect(page.getByText(/Publish at least one problem statement/)).toBeVisible();
  });

  test("judge sees only assigned work and locked final scores", async ({ page }) => {
    await login(page, "judge1@omnihack.example");
    await page.goto("/dashboard/judging");
    await expect(page.getByRole("heading", { name: "Your evaluations" })).toBeVisible();
    await page.getByRole("link", { name: "View", exact: true }).first().click();
    await expect(page.getByText(/This evaluation is locked/)).toBeVisible();
    // A judge may not open someone else's assignment.
    const other = await db.judgeAssignment.findFirstOrThrow({ where: { judge: { email: "judge2@omnihack.example" } } });
    await page.goto(`/dashboard/judging/${other.id}`);
    await expect(page.getByText("Something went wrong")).toBeVisible();
  });

  test("organizer manages sponsors with a confirmation gate", async ({ page }) => {
    await login(page, "organizer@omnihack.example");
    const c = await db.competition.findUniqueOrThrow({ where: { slug: "climate-code-hackathon-demo" } });
    await page.goto(`/organizer/competitions/${c.id}/sponsors`);
    await expect(page.getByRole("heading", { name: "Sponsor report" })).toBeVisible();
    const name = `E2E Sponsor ${Date.now()}`;
    await page.getByLabel(/^Name/).fill(name);
    await page.getByRole("button", { name: "Save sponsor" }).click();
    await expect(page.locator("span.font-semibold", { hasText: name })).toBeVisible();
    await expect(page.getByText("Unconfirmed — hidden").first()).toBeVisible();
  });

  test("participants cannot reach admin or organizer consoles", async ({ page }) => {
    await login(page, "alice@omnihack.example");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard\?denied=admin/);
    const c = await db.competition.findUniqueOrThrow({ where: { slug: "smart-campus-ideathon-demo" } });
    await page.goto(`/organizer/competitions/${c.id}`);
    await expect(page).toHaveURL(/\/dashboard\?denied=competition/);
    const res = await page.request.get(`/api/v1/organizer/competitions/${c.id}/export/registrations`);
    expect(res.status()).toBe(403);
  });
});
