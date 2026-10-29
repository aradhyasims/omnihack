// Hosting fee (organizer → OmniHack), the mentor & jury directory it unlocks, and participation fees
// (participant → organizer). All payments are bank transfers verified by a person.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { Actor } from "@/server/authz";
import * as comp from "@/server/modules/competitions/service";
import * as payments from "@/server/modules/payments/service";
import { applyPendingMentorInvites, assignFromDirectory, mentorDirectory } from "@/server/modules/mentoring/directory";
import { registerForCompetition, reviewRegistration } from "@/server/modules/registrations/service";
import { days, local, makeUser, resetDb } from "../helpers";

let admin: Actor, owner: Actor, coordinator: Actor, stranger: Actor, alice: Actor, bob: Actor;
let orgId = "";
let cid = "";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const transfer = (utr: string, paidOn = ymd(days(-1))) => ({ utr, paidOn, payerName: "Acme University Accounts" });

async function setUpPublishable(competitionId: string, slug: string) {
  await comp.updateBasics(owner, competitionId, {
    title: "Paid Hack",
    slug,
    tagline: "A hackathon used to test payments.",
    description: "Integration-test hackathon covering hosting and participation fees.",
    category: "Test",
    language: "English",
    contactEmail: "owner@test.example",
    bannerTheme: "indigo",
  });
  await comp.updateDelivery(owner, competitionId, { mode: "ONLINE", timezone: "UTC", onlineInstructions: "Online." });
  await comp.updateDates(owner, competitionId, {
    registrationOpensAt: local(days(-1)),
    registrationClosesAt: local(days(5)),
    startsAt: local(days(6)),
    endsAt: local(days(8)),
  });
  await comp.upsertChallenge(owner, competitionId, { title: "Challenge", description: "Build something.", visibility: "PUBLIC" });
}

beforeAll(async () => {
  await resetDb();
  [owner, coordinator, stranger, alice, bob] = await Promise.all(
    ["pay-owner", "pay-coord", "pay-stranger", "pay-alice", "pay-bob"].map((n) => makeUser(`${n}@test.example`)),
  );
  admin = await makeUser("pay-admin@test.example", { admin: true });
  const org = await comp.createOrganization(owner, { name: "Acme University", type: "UNIVERSITY" });
  orgId = org.id;
  await db.organization.update({ where: { id: org.id }, data: { verified: true } });
  await comp.addOrgMember(owner, org.id, coordinator.email, "COORDINATOR");
  cid = (await comp.createCompetitionDraft(owner, { organizationId: org.id, title: "Paid Hack", type: "HACKATHON" })).id;
});

describe("Hosting fee — ₹10,000 to OmniHack before the competition is enabled", () => {
  it("starts unpaid and keeps judges, mentors, the directory and publishing locked", async () => {
    const c = await db.competition.findUniqueOrThrow({ where: { id: cid } });
    expect(c.hostingFeeStatus).toBe("UNPAID");
    expect(c.hostingFeeAmountMinor).toBe(10_000_00);
    await expect(comp.addStaff(owner, cid, { email: alice.email, role: "JUDGE" })).rejects.toMatchObject({ code: "PRECONDITION" });
    await expect(comp.addStaff(owner, cid, { email: alice.email, role: "MENTOR" })).rejects.toMatchObject({ code: "PRECONDITION" });
    // Non-judging staff can still be added while the fee is pending.
    await comp.addStaff(owner, cid, { email: bob.email, role: "VOLUNTEER" });
    await expect(mentorDirectory(owner, cid)).rejects.toMatchObject({ code: "PRECONDITION" });
    await setUpPublishable(cid, "paid-hack-test");
    expect(await comp.getPublishIssues(cid)).toEqual([expect.stringMatching(/hosting fee/)]);
    await expect(comp.publishCompetition(owner, cid)).rejects.toMatchObject({ code: "PRECONDITION" });
  });

  it("validates the reported transfer and only lets competition editors submit it", async () => {
    await expect(payments.submitHostingFee(stranger, cid, transfer("UTR123456789"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(payments.submitHostingFee(owner, cid, transfer("12"))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(payments.submitHostingFee(owner, cid, transfer("UTR123456789", ymd(days(3))))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(payments.submitHostingFee(owner, cid, { utr: "UTR123456789", paidOn: ymd(days(-1)) })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("organizer reports the transfer; admin rejects, organizer resubmits, admin acknowledges and enables", async () => {
    await payments.submitHostingFee(coordinator, cid, transfer(" utr 1234 5678 9 "));
    const first = await db.hostingFeePayment.findFirstOrThrow({ where: { competitionId: cid } });
    expect(first).toMatchObject({ utr: "UTR123456789", amountMinor: 10_000_00, status: "SUBMITTED", submittedById: coordinator.id });
    expect((await db.competition.findUniqueOrThrow({ where: { id: cid } })).hostingFeeStatus).toBe("SUBMITTED");
    expect(await db.notification.count({ where: { userId: admin.id, type: "hosting_fee.submitted" } })).toBe(1);
    await expect(payments.submitHostingFee(owner, cid, transfer("UTR999999999"))).rejects.toMatchObject({ code: "PRECONDITION" });

    await expect(payments.reviewHostingFee(owner, first.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(payments.reviewHostingFee(admin, first.id, false, "")).rejects.toMatchObject({ code: "VALIDATION" });
    await payments.reviewHostingFee(admin, first.id, false, "No credit with this UTR on 20 Oct.");
    expect((await db.competition.findUniqueOrThrow({ where: { id: cid } })).hostingFeeStatus).toBe("REJECTED");
    expect(await db.notification.count({ where: { userId: owner.id, type: "hosting_fee.rejected" } })).toBe(1);
    await expect(payments.reviewHostingFee(admin, first.id, true)).rejects.toMatchObject({ code: "PRECONDITION" });

    // The same UTR can't be reused; a corrected one goes back into the queue.
    await expect(payments.submitHostingFee(owner, cid, transfer("UTR123456789"))).rejects.toMatchObject({ code: "VALIDATION" });
    await payments.submitHostingFee(owner, cid, transfer("BARBN24294012345"));
    const second = await db.hostingFeePayment.findFirstOrThrow({ where: { competitionId: cid, status: "SUBMITTED" } });
    await payments.reviewHostingFee(admin, second.id, true);

    const c = await db.competition.findUniqueOrThrow({ where: { id: cid } });
    expect(c.hostingFeeStatus).toBe("VERIFIED");
    expect(await db.notification.count({ where: { userId: owner.id, type: "hosting_fee.verified" } })).toBe(1);
    expect(
      await db.auditLog.count({ where: { competitionId: cid, action: { in: ["hosting_fee.submitted", "hosting_fee.rejected", "hosting_fee.verified"] } } }),
    ).toBe(4);
    expect(await comp.getPublishIssues(cid)).toEqual([]);
    await expect(payments.submitHostingFee(owner, cid, transfer("UTR000000001"))).rejects.toMatchObject({ code: "PRECONDITION" });
  });

  it("admins can waive the fee with a recorded reason", async () => {
    const other = (await comp.createCompetitionDraft(owner, { organizationId: orgId, title: "Partner Hack", type: "IDEATHON" })).id;
    await expect(payments.waiveHostingFee(owner, other, "free")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(payments.waiveHostingFee(admin, other, " ")).rejects.toMatchObject({ code: "VALIDATION" });
    await payments.waiveHostingFee(admin, other, "OmniHack's own event");
    expect((await db.competition.findUniqueOrThrow({ where: { id: other } })).hostingFeeStatus).toBe("WAIVED");
    expect(await db.auditLog.findFirst({ where: { competitionId: other, action: "hosting_fee.waived" } })).toMatchObject({ actorId: admin.id });
    await expect(payments.waiveHostingFee(admin, other, "again")).rejects.toMatchObject({ code: "PRECONDITION" });
  });
});

describe("Mentor & jury directory — available once the competition is enabled", () => {
  let withAccountId = "",
    noAccountId = "";

  it("lists registered mentors without their email or mobile, and hides declined ones", async () => {
    const base = { designation: "Engineer", qualification: "B.E.", city: "Bengaluru", country: "India", domains: ["ai-ml"] };
    withAccountId = (
      await db.mentorApplication.create({
        data: { ...base, name: "Alice Mentor", email: alice.email, mobile: "+919800000001", linkedinUrl: "https://www.linkedin.com/in/alice-m" },
      })
    ).id;
    noAccountId = (
      await db.mentorApplication.create({
        data: { ...base, name: "Nina New", email: "nina.new@test.example", mobile: "+919800000002", linkedinUrl: "https://www.linkedin.com/in/nina-n" },
      })
    ).id;
    await db.mentorApplication.create({
      data: { ...base, name: "Spam", email: "spam@test.example", linkedinUrl: "https://www.linkedin.com/in/spam", status: "DECLINED" },
    });
    await expect(mentorDirectory(stranger, cid)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const list = await mentorDirectory(owner, cid);
    expect(list.map((m) => m.name).sort()).toEqual(["Alice Mentor", "Nina New"]);
    expect(JSON.stringify(list)).not.toMatch(/@test\.example|\+9198/);
    expect(list.find((m) => m.id === withAccountId)).toMatchObject({ hasAccount: true, judge: "NONE", qualification: "B.E.", city: "Bengaluru" });
    expect(list.find((m) => m.id === noAccountId)).toMatchObject({ hasAccount: false });
  });

  it("assigns a mentor who has an account straight away", async () => {
    expect(await assignFromDirectory(owner, cid, withAccountId, "JUDGE")).toBe("ASSIGNED");
    expect(await db.competitionMember.count({ where: { competitionId: cid, userId: alice.id, role: "JUDGE", status: "ACTIVE" } })).toBe(1);
    expect((await mentorDirectory(owner, cid)).find((m) => m.id === withAccountId)?.judge).toBe("ASSIGNED");
    await expect(assignFromDirectory(owner, cid, withAccountId, "OWNER")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("invites someone without an account; the role applies once they verify an account with that email", async () => {
    expect(await assignFromDirectory(owner, cid, noAccountId, "MENTOR")).toBe("INVITED");
    expect(await db.emailOutbox.count({ where: { toEmail: "nina.new@test.example" } })).toBe(1);
    await expect(assignFromDirectory(owner, cid, noAccountId, "MENTOR")).rejects.toMatchObject({ code: "PRECONDITION" });
    expect((await mentorDirectory(owner, cid)).find((m) => m.id === noAccountId)?.mentor).toBe("INVITED");

    const nina = await makeUser("nina.new@test.example", { verified: false });
    expect(await applyPendingMentorInvites(nina.id)).toBe(0); // an unverified address proves nothing
    await db.user.update({ where: { id: nina.id }, data: { emailVerifiedAt: new Date() } });
    expect(await applyPendingMentorInvites(nina.id)).toBe(1);
    expect(await db.competitionMember.count({ where: { competitionId: cid, userId: nina.id, role: "MENTOR", status: "ACTIVE" } })).toBe(1);
    expect(await db.mentorInvite.findFirstOrThrow({ where: { mentorApplicationId: noAccountId } })).toMatchObject({ status: "ACCEPTED" });
    expect(await applyPendingMentorInvites(nina.id)).toBe(0);
  });
});

describe("Participation fee — participants pay the organizer, who verifies", () => {
  it("requires valid payee bank details for a paid competition", async () => {
    const paid = { isPaid: "on", feeAmount: "500", currency: "INR" };
    await expect(comp.updateRules(owner, cid, paid)).rejects.toMatchObject({ code: "VALIDATION" });
    const payee = {
      payeeAccountName: "Acme University",
      payeeAccountNumber: "1234 5678 9012",
      payeeIfsc: "barb0vjgabz",
      payeeBankName: "Bank of Baroda",
      payeeBranch: "Basavanagudi",
      payeeUpiId: "",
    };
    await expect(comp.updateRules(owner, cid, { ...paid, ...payee, payeeIfsc: "BARB123" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(comp.updateRules(owner, cid, { ...paid, ...payee, payeeUpiId: "not-a-upi" })).rejects.toMatchObject({ code: "VALIDATION" });
    await comp.updateRules(owner, cid, { ...paid, ...payee });
    const c = await db.competition.findUniqueOrThrow({ where: { id: cid } });
    expect(c).toMatchObject({ isPaid: true, feeAmountMinor: 50_000, payeeAccountNumber: "123456789012", payeeIfsc: "BARB0VJGABZ", payeeUpiId: null });
    expect(await comp.getPublishIssues(cid)).toEqual([]);
    expect(await comp.publishCompetition(owner, cid)).toBe("PUBLISHED");
  });

  it("holds the registration until the organizer verifies the participant's transfer", async () => {
    const reg = await registerForCompetition(bob, cid, { participantType: "STUDENT", acceptRules: "on" });
    expect(reg).toMatchObject({ status: "PENDING", paymentStatus: "PENDING" });
    await expect(reviewRegistration(owner, reg.id, "APPROVED")).rejects.toMatchObject({ code: "PRECONDITION" });

    await expect(payments.submitParticipantPayment(bob, cid, transfer("x"))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(payments.submitParticipantPayment(stranger, cid, transfer("SBIN000111222"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await payments.submitParticipantPayment(bob, cid, transfer("SBIN000111222"));
    const p1 = await db.payment.findFirstOrThrow({ where: { registrationId: reg.id } });
    expect(p1).toMatchObject({ provider: "BANK_TRANSFER", providerRef: "SBIN000111222", amountMinor: 50_000, currency: "INR", status: "PENDING" });
    expect(await db.notification.count({ where: { userId: owner.id, type: "payment.submitted" } })).toBe(1);
    await expect(payments.submitParticipantPayment(bob, cid, transfer("SBIN000111333"))).rejects.toMatchObject({ code: "PRECONDITION" });

    await expect(payments.reviewParticipantPayment(bob, p1.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(payments.reviewParticipantPayment(owner, p1.id, false)).rejects.toMatchObject({ code: "VALIDATION" });
    await payments.reviewParticipantPayment(owner, p1.id, false, "Amount received was ₹50, not ₹500.");
    expect(await db.registration.findUniqueOrThrow({ where: { id: reg.id } })).toMatchObject({ status: "PENDING", paymentStatus: "FAILED" });
    expect(await db.notification.count({ where: { userId: bob.id, type: "payment.rejected" } })).toBe(1);

    await expect(payments.submitParticipantPayment(bob, cid, transfer("SBIN000111222"))).rejects.toMatchObject({ code: "VALIDATION" });
    await payments.submitParticipantPayment(bob, cid, transfer("SBIN000111444"));
    const p2 = await db.payment.findFirstOrThrow({ where: { registrationId: reg.id, status: "PENDING" } });
    await payments.reviewParticipantPayment(coordinator, p2.id, true);
    expect(await db.registration.findUniqueOrThrow({ where: { id: reg.id } })).toMatchObject({ status: "APPROVED", paymentStatus: "PAID" });
    expect(await db.notification.count({ where: { userId: bob.id, type: "payment.verified" } })).toBe(1);
    await expect(payments.submitParticipantPayment(bob, cid, transfer("SBIN000111555"))).rejects.toMatchObject({ code: "PRECONDITION" });
  });

  it("keeps registrations that also need manual approval pending after payment", async () => {
    await db.competition.update({ where: { id: cid }, data: { requireRegistrationApproval: true } });
    const carol = await makeUser("pay-carol@test.example");
    const reg = await registerForCompetition(carol, cid, { participantType: "STUDENT", acceptRules: "on" });
    await payments.submitParticipantPayment(carol, cid, transfer("HDFC0000777"));
    const p = await db.payment.findFirstOrThrow({ where: { registrationId: reg.id } });
    await payments.reviewParticipantPayment(owner, p.id, true);
    expect(await db.registration.findUniqueOrThrow({ where: { id: reg.id } })).toMatchObject({ status: "PENDING", paymentStatus: "PAID" });
    await reviewRegistration(owner, reg.id, "APPROVED");
    expect((await db.registration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe("APPROVED");
  });
});
