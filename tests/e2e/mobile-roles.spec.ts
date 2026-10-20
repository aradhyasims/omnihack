import { expect, test } from "@playwright/test";
import { db, login } from "./helpers";

// Judging, team-finder and navigation tasks on a phone-sized viewport (runs in both projects).
test.describe("judging and teams on mobile @mobile", () => {
  test("judge opens assignments and a scorecard from the mobile menu", async ({ page }) => {
    await login(page, "judge2@omnihack.example");
    const vw = page.viewportSize()!.width;
    if (vw < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await page.getByRole("link", { name: "Judging", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your evaluations" })).toBeVisible();
    await page.getByRole("link", { name: "View", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Scorecard" })).toBeVisible();
    await expect(page.getByText("Weighted total", { exact: true })).toBeVisible();
    // Page must not scroll horizontally on a phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("participant browses the team finder", async ({ page }) => {
    const team = await db.team.findFirstOrThrow({ where: { name: "Rainmakers" } });
    await db.team.update({ where: { id: team.id }, data: { lookingForMembers: true } });
    await login(page, "frank@omnihack.example");
    await page.goto("/dashboard/competitions/climate-code-hackathon-demo/teams");
    await expect(page.getByRole("heading", { name: "Team finder" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rainmakers" })).toBeVisible();
    await page
      .getByLabel(/Message to the leader/)
      .first()
      .fill("Happy to help with the frontend.");
    await page.getByRole("button", { name: "Ask to join" }).first().click();
    await expect(page.getByText(/Request sent/)).toBeVisible();
  });
});
