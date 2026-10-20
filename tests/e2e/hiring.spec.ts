// Placement & recruitment: public pages, participant opt-in, recruiter shortlisting, candidate tracking.
// Uses the demo seed (recruiter@omnihack.example, Climate Code). Re-runnable: the participant leaves the pool at the end.
import { expect, test } from "@playwright/test";
import { db, login } from "./helpers";

test("public careers pages list demo openings @mobile", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { name: "Get hired for what you build" })).toBeVisible();
  await expect(page.getByText("Climate Data Intern (Demo)")).toBeVisible();
  await page.goto("/opportunities?type=PRE_PLACEMENT_OFFER");
  await expect(page.getByText("Climate Data Intern (Demo)")).toHaveCount(0);
  await page.goto("/hire");
  await expect(page.getByRole("heading", { name: /Hire people who have already solved your problem/ })).toBeVisible();
  await page.goto("/competitions?hiring=1");
  await expect(page.getByRole("link", { name: /Climate Code/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /HealthTech/ })).toHaveCount(0);
});

test("participant opts in, recruiter shortlists, participant sees it", async ({ browser }) => {
  const climate = await db.competition.findUniqueOrThrow({ where: { slug: "climate-code-hackathon-demo" } });
  const henry = await db.user.findUniqueOrThrow({ where: { email: "henry@omnihack.example" } });
  await db.talentConsent.deleteMany({ where: { competitionId: climate.id, userId: henry.id } });

  const p = await (await browser.newContext()).newPage();
  await login(p, "henry@omnihack.example");
  await p.goto("/dashboard/competitions/climate-code-hackathon-demo");
  await expect(p.getByText("Career opportunities")).toBeVisible();
  await p.getByRole("button", { name: "Join the talent pool" }).click();
  await expect(p.getByText("Only participants aged 18 or over can join the talent pool.")).toBeVisible();
  await p.getByLabel("I confirm I am 18 or older").check();
  await p.getByLabel(/I agree that this competition's hiring partners/).check();
  await p.getByRole("button", { name: "Join the talent pool" }).click();
  await expect(p.getByText("In talent pool")).toBeVisible();

  const r = await (await browser.newContext()).newPage();
  await login(r, "recruiter@omnihack.example");
  await r.goto(`/organizer/competitions/${climate.id}/hiring`);
  await expect(r.getByText("You are recruiting for")).toBeVisible();
  const row = r.getByRole("row", { name: /Henry Hussain/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(row.getByText("Shortlisted")).toBeVisible();
  await row.getByRole("link", { name: /Henry Hussain/ }).click();
  await expect(r.getByText("henry@omnihack.example")).toBeVisible(); // email released after shortlisting
  await expect(r.getByText(/Judging scores and comments are confidential/)).toBeVisible();

  await p.goto("/dashboard/opportunities");
  await expect(p.getByText("Example Tech (Demo)").first()).toBeVisible();
  await expect(p.getByText("Shortlisted").first()).toBeVisible();

  // Clean up: leaving the pool closes the application.
  await p.goto("/dashboard/competitions/climate-code-hackathon-demo");
  await p.getByRole("button", { name: "Leave the talent pool" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Leave talent pool" }).click();
  await expect(p.getByRole("button", { name: "Join the talent pool" })).toBeVisible();
});
