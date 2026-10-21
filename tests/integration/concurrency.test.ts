// Concurrency: capacity limits and team sizes must hold when many requests arrive at once.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import * as comp from "@/server/modules/competitions/service";
import { registerForCompetition } from "@/server/modules/registrations/service";
import { createTeam, joinTeamByCode } from "@/server/modules/teams/service";
import { days, enableHosting, local, makeUser, resetDb } from "../helpers";

let cid = "";

beforeAll(async () => {
  await resetDb();
  const owner = await makeUser("owner@cc.example");
  const org = await comp.createOrganization(owner, { name: "Concurrency Org", type: "COMPANY" });
  await db.organization.update({ where: { id: org.id }, data: { verified: true } });
  const c = await comp.createCompetitionDraft(owner, { organizationId: org.id, title: "Rush Hack", type: "HACKATHON" });
  cid = c.id;
  await enableHosting(cid);
  await comp.updateBasics(owner, cid, {
    title: "Rush Hack",
    slug: "rush-hack",
    tagline: "Capacity under concurrent load.",
    description: "Integration test for row-locked capacity and team-size checks.",
    category: "Test",
    language: "English",
    contactEmail: "o@cc.example",
    bannerTheme: "indigo",
  });
  await comp.updateDelivery(owner, cid, { mode: "ONLINE", timezone: "UTC", onlineInstructions: "Online" });
  await comp.updateEligibility(owner, cid, {
    participationMode: "TEAM",
    minTeamSize: "1",
    maxTeamSize: "3",
    maxParticipants: "20",
    eligibilityTypes: ["OPEN"],
    customFields: "[]",
  });
  await comp.updateDates(owner, cid, {
    registrationOpensAt: local(days(-1)),
    registrationClosesAt: local(days(5)),
    startsAt: local(days(6)),
    endsAt: local(days(8)),
  });
  await comp.upsertChallenge(owner, cid, { title: "Challenge", description: "Register before seats run out.", visibility: "PUBLIC" });
  await comp.publishCompetition(owner, cid);
});

describe("concurrent registrations", () => {
  it("never exceeds maxParticipants when 50 people register at the same moment", async () => {
    const users = await Promise.all(Array.from({ length: 50 }, (_, i) => makeUser(`rush${i}@cc.example`)));
    const results = await Promise.allSettled(users.map((u) => registerForCompetition(u, cid, { participantType: "STUDENT", acceptRules: "on" })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const full = results.filter((r) => r.status === "rejected" && /participant limit/.test(String((r as PromiseRejectedResult).reason?.message))).length;
    expect(ok).toBe(20);
    expect(full).toBe(30);
    expect(await db.registration.count({ where: { competitionId: cid, status: { in: ["APPROVED", "PENDING"] } } })).toBe(20);
  });
});

describe("concurrent team joins", () => {
  it("never exceeds the team size and never puts one person in two teams", async () => {
    const regs = await db.registration.findMany({ where: { competitionId: cid, status: "APPROVED" }, include: { user: true }, take: 20 });
    const actors = regs.map((r) => ({
      id: r.user.id,
      email: r.user.email,
      name: r.user.name,
      platformRole: r.user.platformRole,
      status: r.user.status,
      emailVerifiedAt: r.user.emailVerifiedAt,
    }));
    const [leaderA, leaderB, ...others] = actors;
    const teamA = await createTeam(leaderA, cid, { name: "Alpha" });
    const teamB = await createTeam(leaderB, cid, { name: "Beta" });
    // 10 people race to join Alpha (max 3 incl. leader); the same 5 of them also race to join Beta.
    const racers = others.slice(0, 10);
    const attempts = [...racers.map((u) => joinTeamByCode(u, teamA.inviteCode)), ...racers.slice(0, 5).map((u) => joinTeamByCode(u, teamB.inviteCode))];
    await Promise.allSettled(attempts);
    expect(await db.teamMembership.count({ where: { teamId: teamA.id } })).toBe(3);
    expect(await db.teamMembership.count({ where: { teamId: teamB.id } })).toBeLessThanOrEqual(3);
    const dupes = await db.teamMembership.groupBy({
      by: ["userId"],
      where: { competitionId: cid },
      _count: { _all: true },
      having: { userId: { _count: { gt: 1 } } },
    });
    expect(dupes).toHaveLength(0);
  });
});
