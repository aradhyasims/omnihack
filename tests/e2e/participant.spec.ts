import { expect, test } from "@playwright/test";
import { signUpVerified } from "./helpers";

test.describe("participant journey @mobile", () => {
  test("sign up, register, start a project and submit an idea", async ({ page }) => {
    await signUpVerified(page, "E2E Participant");
    await page.goto("/competitions/smart-campus-ideathon-demo/register");
    // Eligibility: professionals and students only; try an ineligible group first.
    await page.getByLabel("I am a").selectOption("STARTUP");
    await page.getByLabel(/I have read and accept/).check();
    await page.getByRole("button", { name: "Complete registration" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /open to students, professionals only/i })).toBeVisible();
    await page.getByLabel("I am a").selectOption("STUDENT");
    await page.getByRole("button", { name: "Complete registration" }).click();
    await page.waitForURL(/\/dashboard\/competitions\/smart-campus-ideathon-demo/);
    await expect(page.getByText("You're registered!")).toBeVisible();

    await page.getByLabel("Working title").fill("E2E Idea");
    await page.getByRole("button", { name: "Start individual project" }).click();
    await expect(page.getByText(/You're competing individually/)).toBeVisible();

    // Final submit with missing required fields shows validation errors.
    await page.getByLabel(/Idea title/).fill("E2E Idea");
    await page.getByRole("button", { name: "Submit final version" }).click();
    await expect(page.getByText("Your submission is incomplete. Fix the highlighted fields.")).toBeVisible();

    await page.getByLabel(/Problem statement/).fill("Students waste time finding free study rooms.");
    await page.getByLabel(/Target users/).fill("Undergraduate students");
    await page.getByLabel(/^Proposed solution/).fill("A live room-availability map from door sensors.");
    await page.getByLabel(/Innovation and differentiation/).fill("Uses existing sensors; no new hardware.");
    await page.getByLabel(/Potential impact/).fill("Saves hours per student per week.");
    await page.getByRole("button", { name: "Submit final version" }).click();
    await expect(page.getByText(/Submitted — version 1 received/)).toBeVisible();
    await expect(page.getByText("Submitted v1").first()).toBeVisible();
  });
});
