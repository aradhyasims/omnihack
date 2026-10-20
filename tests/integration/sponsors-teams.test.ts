// Sponsor management (confirmation gate, contact-data protection, aggregate report) and team finder.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { Actor } from "@/server/authz";
import * as comp from "@/server/modules/competitions/service";
import { getCompetitionPage } from "@/server/modules/competitions/queries";
import { addSponsor, setPrizeSponsor, setSponsorConfirmed, sponsorWorkspace } from "@/server/modules/sponsors/service";
import { registerForCompetition } from "@/server/modules/registrations/service";
import { createTeam, listOpenTeams, requestToJoin, updateTeamDetails } from "@/server/modules/teams/service";
import { days, local, makeUser, resetDb } from "../helpers";

let owner: Actor, rep: Actor, leader: Actor, seeker: Actor, outsider: Actor;
let cid = "";

beforeAll(async () => {
  await resetDb();
  [owner, rep, leader, seeker, outsider] = await Promise.all(["owner", "rep", "leader", "seeker", "outsider"].map((n) => makeUser(`${n}@sp.example`)));
  const org = await comp.createOrganization(owner, { name: "Sponsor Org", type: "COMPANY" });
  await db.organization.update({ where: { id: org.id }, data: { verified: true } });
  const c = await comp.createCompetitionDraft(owner, { organizationId: org.id, title: "Sponsored Hack", type: "HACKATHON" });
  cid = c.id;
  await comp.updateBasics(owner, cid, {
    title: "Sponsored Hack",
    slug: "sponsored-hack",
    tagline: "A sponsored hackathon for tests.",
    description: "Integration test competition for sponsors and the team finder.",
    category: "Test",
    language: "English",
    contactEmail: "o@sp.example",
    bannerTheme: "indigo",
  });
  await comp.updateDelivery(owner, cid, { mode: "ONLINE", timezone: "UTC", onlineInstructions: "Online" });
  await comp.updateDates(owner, cid, {
    registrationOpensAt: local(days(-1)),
    registrationClosesAt: local(days(5)),
    startsAt: local(days(6)),
    endsAt: local(days(8)),
  });
  await comp.upsertChallenge(owner, cid, { title: "Challenge", description: "Build something useful.", visibility: "PUBLIC" });
  await comp.upsertPrize(owner, cid, { title: "Best use of data", category: "SPONSOR" });
  await comp.publishCompetition(owner, cid);
});

describe("sponsor management", () => {
  it("only shows confirmed sponsors publicly", async () => {
    const link = await addSponsor(owner, cid, { name: "Acme Data", tier: "Gold", contactName: "Pat", contactEmail: "pat@acme.example" });
    expect((await getCompetitionPage("sponsored-hack", null))!.competition.sponsors).toHaveLength(0);
    await setSponsorConfirmed(owner, link.id, true);
    const sponsorsShown = (await getCompetitionPage("sponsored-hack", null))!.competition.sponsors;
    expect(sponsorsShown.map((s) => s.sponsor.name)).toEqual(["Acme Data"]);
  });

  it("protects sponsor contacts and restricts management", async () => {
    await comp.addStaff(owner, cid, { email: rep.email, role: "SPONSOR_REP" });
    const view = await sponsorWorkspace(rep, cid);
    expect(view.canManage).toBe(false);
    expect(view.links[0].sponsor.contactEmail).toBeNull();
    expect(JSON.stringify(view.report)).not.toMatch(/@/); // aggregate only
    expect((await sponsorWorkspace(owner, cid)).links[0].sponsor.contactEmail).toBe("pat@acme.example");
    await expect(addSponsor(rep, cid, { name: "Sneaky", tier: "Gold" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sponsorWorkspace(outsider, cid)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("attributes sponsor awards only to linked sponsors", async () => {
    const prize = await db.prize.findFirstOrThrow({ where: { competitionId: cid } });
    const other = await db.sponsor.create({ data: { name: "Unlinked", slug: "unlinked" } });
    await expect(setPrizeSponsor(owner, prize.id, other.id)).rejects.toMatchObject({ code: "VALIDATION" });
    const acme = await db.sponsor.findFirstOrThrow({ where: { name: "Acme Data" } });
    await setPrizeSponsor(owner, prize.id, acme.id);
    expect((await db.prize.findUniqueOrThrow({ where: { id: prize.id } })).sponsorId).toBe(acme.id);
  });
});

describe("team finder", () => {
  it("lists teams looking for members to approved participants only, and sends join requests", async () => {
    for (const u of [leader, seeker]) await registerForCompetition(u, cid, { participantType: "STUDENT", acceptRules: "on" });
    await db.user.update({ where: { id: leader.id }, data: { skills: ["python", "ml"] } });
    const team = await createTeam(leader, cid, { name: "Data Wizards" });
    expect(await listOpenTeams(seeker, cid)).toHaveLength(0); // not flagged yet
    await updateTeamDetails(leader, team.id, { description: "Need a designer", lookingForMembers: "on" });
    const open = await listOpenTeams(seeker, cid);
    expect(open[0]).toMatchObject({ name: "Data Wizards", seatsLeft: 3, skills: ["python", "ml"] });
    expect(JSON.stringify(open)).not.toContain(leader.email);
    await expect(listOpenTeams(outsider, cid)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await requestToJoin(seeker, team.id, "I do UI design");
    const n = await db.notification.findFirstOrThrow({ where: { userId: leader.id, type: "team.join_request" } });
    expect(n.body).toContain("I do UI design");
    expect(n.body).toContain(seeker.email);
    await expect(requestToJoin(leader, team.id, "")).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
