import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, CardHeader, DemoBadge, EmptyState, Icon } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { SubmissionForm } from "@/components/workspace/submission-form";
import { requireUser } from "@/server/auth/current";
import { participantWorkspace } from "@/server/modules/participants/service";
import { competitionOpenings, getConsent } from "@/server/modules/talent/service";
import { CareerCard } from "@/components/talent/career-card";
import { DECISION_META, formatFee, PAYMENT_STATUS_META, REGISTRATION_STATUS_META, STAGE_STATUS_META, TYPE_LABEL } from "@/lib/labels";
import { formatDate, formatDateTime, relativeFromNow } from "@/lib/time";
import { db } from "@/server/db";
import { BankDetails, TransferForm } from "@/components/payments/bank-transfer";
import {
  submitEntryFeeAction,
  createTeamAction,
  dissolveTeamAction,
  inviteAction,
  joinTeamAction,
  leaveTeamAction,
  removeMemberAction,
  requestShowcaseAction,
  revokeInviteAction,
  saveSubmissionAction,
  startSoloAction,
  supportRequestAction,
  transferLeaderAction,
  updateTeamAction,
  withdrawAction,
  withdrawShowcaseAction,
} from "../../actions";

export const metadata: Metadata = { title: "Competition workspace" };

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/dashboard/competitions/${slug}`);
  const w = await participantWorkspace(user, slug);
  const c = w.competition;
  const tz = c.timezone;

  if (!w.registration) {
    return (
      <EmptyState
        title="You're not registered for this competition"
        description={c.title}
        action={<ButtonLink href={`/competitions/${slug}`}>View competition</ButtonLink>}
      />
    );
  }
  const reg = w.registration;
  const regMeta = REGISTRATION_STATUS_META[reg.status];
  const approved = reg.status === "APPROVED";
  const qr = approved && c.mode !== "ONLINE" ? await QRCode.toDataURL(reg.checkInCode, { margin: 1, width: 180 }) : null;
  const teamAllowed = c.participationMode !== "INDIVIDUAL";
  const soloAllowed = c.participationMode !== "TEAM";
  const team = w.team;
  const project = w.project;
  const challenges = c.challenges.map((ch) => ({ value: ch.id, label: ch.title }));
  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
  const [openings, consent] = c.hiringEnabled ? await Promise.all([competitionOpenings(c.id), getConsent(user.id, c.id)]) : [[], null];
  const paymentDue =
    c.isPaid && (reg.paymentStatus === "PENDING" || reg.paymentStatus === "FAILED") && reg.status !== "WITHDRAWN" && reg.status !== "REJECTED";
  const lastPayment = paymentDue ? await db.payment.findFirst({ where: { registrationId: reg.id }, orderBy: { createdAt: "desc" } }) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm font-semibold text-brand-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{c.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>{TYPE_LABEL[c.type]}</Badge>
            <Badge tone={regMeta.tone} dot>
              Registration: {regMeta.label}
            </Badge>
            {c.isDemo ? <DemoBadge /> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/competitions/${slug}`} variant="outline" size="sm">
            Event page
          </ButtonLink>
          {c.resultsStatus === "PUBLISHED" ? (
            <ButtonLink href={`/competitions/${slug}/results`} size="sm">
              Results
            </ButtonLink>
          ) : null}
        </div>
      </div>

      {sp.registered ? (
        <Alert tone="success" title={approved ? "You're registered!" : "Registration received"}>
          {approved
            ? "A confirmation has been sent to your email. Next, set up your team or project below."
            : "The organizer will review your registration. We'll email you when it's decided."}
        </Alert>
      ) : null}
      {paymentDue ? (
        <Card>
          <CardHeader
            title="Pay the entry fee"
            description="Your place is confirmed once the organizer verifies your payment."
            action={<Badge tone={PAYMENT_STATUS_META[reg.paymentStatus].tone}>{PAYMENT_STATUS_META[reg.paymentStatus].label}</Badge>}
          />
          <div className="space-y-4 p-5">
            {lastPayment?.status === "PENDING" ? (
              <p className="text-sm text-ink-700">
                Payment details sent — UTR <strong className="font-mono">{lastPayment.providerRef}</strong>, paid on {formatDate(lastPayment.paidOn, "UTC")}. The
                organizer will verify it against their account and you&apos;ll be notified.
              </p>
            ) : (
              <>
                {reg.paymentStatus === "FAILED" && lastPayment?.reviewNote ? (
                  <Alert tone="danger" title={`The organizer couldn't confirm UTR ${lastPayment.providerRef}`}>
                    {lastPayment.reviewNote}
                  </Alert>
                ) : null}
                {c.payeeAccountNumber && c.payeeIfsc ? (
                  <BankDetails
                    amount={formatFee(c.isPaid, c.feeAmountMinor, c.currency)}
                    accountName={c.payeeAccountName ?? ""}
                    accountNumber={c.payeeAccountNumber}
                    ifsc={c.payeeIfsc}
                    bank={c.payeeBankName ?? ""}
                    branch={c.payeeBranch}
                    upiId={c.payeeUpiId}
                  />
                ) : (
                  <Alert tone="warning" title="Payment details not available">
                    The organizer hasn&apos;t added their account details. Contact them at {c.contactEmail}.
                  </Alert>
                )}
                <div>
                  <p className="mb-3 text-sm font-semibold text-ink-800">After paying, submit the transfer details:</p>
                  <TransferForm action={submitEntryFeeAction.bind(null, c.id)} withNote={false} />
                </div>
              </>
            )}
          </div>
        </Card>
      ) : reg.status === "PENDING" ? (
        <Alert tone="warning" title="Awaiting organizer review">
          You'll be able to form a team and submit once your registration is approved.
        </Alert>
      ) : null}
      {reg.status === "REJECTED" ? (
        <Alert tone="danger" title="Registration not approved">
          {reg.eligibilityNote ?? "Contact the organizer for details."}
        </Alert>
      ) : null}
      {reg.status === "WAITLISTED" ? (
        <Alert tone="info" title="You're on the waitlist">
          {reg.eligibilityNote ?? "We'll let you know if a place opens up."}
        </Alert>
      ) : null}
      {c.status === "CANCELLED" ? (
        <Alert tone="danger" title="This competition was cancelled">
          {c.cancellationReason}
        </Alert>
      ) : null}
      {w.awards.length ? (
        <Alert tone="success" title="Congratulations!">
          Your project won: {w.awards.map((a) => a.prize.title).join(", ")}.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Team / project */}
          {(approved && c.status === "PUBLISHED") || team || project ? (
            <Card>
              <CardHeader
                title={team ? `Team: ${team.name}` : project ? "Your individual project" : "Your team or project"}
                description={
                  team
                    ? `${team.members.length}/${c.maxTeamSize} members · ${team.status === "LOCKED" ? "Roster approved by organizer" : "Forming"}`
                    : undefined
                }
              />
              <div className="p-5">
                {team ? (
                  <div className="space-y-6">
                    <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                      {team.members.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-100 text-sm font-bold">{m.user.name.charAt(0)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {m.user.name} {m.userId === user.id ? <span className="text-ink-400">(you)</span> : null}
                            </p>
                            <p className="truncate text-xs text-ink-500">{m.user.skills.join(" · ") || m.user.email}</p>
                          </div>
                          {m.role === "LEADER" ? <Badge tone="brand">Leader</Badge> : null}
                          {w.isLeader && m.userId !== user.id && team.status !== "LOCKED" ? (
                            <ConfirmAction
                              action={removeMemberAction.bind(null, team.id)}
                              hidden={{ userId: m.userId }}
                              label="Remove"
                              title={`Remove ${m.user.name}?`}
                              description="They will lose access to the team's submissions."
                              confirmLabel="Remove member"
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {team.status === "FORMING" && team.members.length < c.maxTeamSize ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl bg-ink-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Invite code</p>
                          <p className="mt-1 font-mono text-lg font-bold tracking-wider">{team.inviteCode}</p>
                          <p className="mt-1 text-xs text-ink-500">Registered participants can join with this code from their workspace.</p>
                        </div>
                        {w.isLeader ? (
                          <ActionForm action={inviteAction.bind(null, team.id)} resetOnSuccess className="space-y-3">
                            <TextInput label="Invite by email" name="email" type="email" required />
                            <SubmitButton size="sm" variant="outline">
                              Send invitation
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </div>
                    ) : null}
                    {w.isLeader && team.invitations.length ? (
                      <div>
                        <p className="mb-2 text-sm font-semibold">Pending invitations</p>
                        <ul className="space-y-2">
                          {team.invitations.map((i) => (
                            <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                              <span>
                                {i.email} <span className="text-xs text-ink-400">expires {relativeFromNow(i.expiresAt)}</span>
                              </span>
                              <InlineAction action={revokeInviteAction.bind(null, i.id)} variant="ghost">
                                Revoke
                              </InlineAction>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {w.isLeader ? (
                      <ActionForm action={updateTeamAction.bind(null, team.id)} className="grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
                        <Select
                          label="Challenge"
                          name="challengeId"
                          placeholder="Not selected yet"
                          defaultValue={team.challengeId ?? ""}
                          options={challenges}
                        />
                        <TextArea label="Team description" name="description" defaultValue={team.description} rows={2} />
                        <Checkbox name="lookingForMembers" label="We're looking for more members" defaultChecked={team.lookingForMembers} />
                        <div className="sm:col-span-2">
                          <SubmitButton size="sm" variant="outline">
                            Save team details
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    ) : null}
                    <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-5">
                      {w.isLeader && team.members.length > 1 ? (
                        <ActionForm action={transferLeaderAction.bind(null, team.id)} className="flex items-end gap-2">
                          <Select
                            label="Transfer leadership"
                            name="userId"
                            options={team.members.filter((m) => m.userId !== user.id).map((m) => ({ value: m.userId, label: m.user.name }))}
                          />
                          <SubmitButton size="md" variant="outline">
                            Transfer
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                      {!w.isLeader ? (
                        <ConfirmAction
                          action={leaveTeamAction.bind(null, team.id)}
                          label="Leave team"
                          title="Leave this team?"
                          description="You can join another team while team formation is open."
                          confirmLabel="Leave team"
                        />
                      ) : null}
                      {w.isLeader && team.members.length === 1 ? (
                        <ConfirmAction
                          action={dissolveTeamAction.bind(null, team.id)}
                          label="Dissolve team"
                          title="Dissolve this team?"
                          description="The team and its draft work will be closed. This cannot be undone."
                          confirmLabel="Dissolve"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : project ? (
                  <p className="text-sm text-ink-600">
                    You're competing individually with <strong>{project.title}</strong>.
                  </p>
                ) : approved ? (
                  <div className="grid gap-6 md:grid-cols-2">
                    {teamAllowed ? (
                      <ActionForm action={createTeamAction.bind(null, c.id)} className="space-y-4">
                        <h3 className="font-bold">Create a team</h3>
                        <TextInput label="Team name" name="name" required maxLength={60} />
                        <Select label="Challenge" name="challengeId" placeholder="Choose later" options={challenges} />
                        <SubmitButton>Create team</SubmitButton>
                      </ActionForm>
                    ) : null}
                    <div className="space-y-6">
                      {teamAllowed ? (
                        <ActionForm action={joinTeamAction} className="space-y-4">
                          <h3 className="font-bold">Join with a code</h3>
                          <TextInput label="Invite code" name="code" placeholder="TM-XXXX-XXXX" required />
                          <SubmitButton variant="outline">Join team</SubmitButton>
                          <p className="text-sm">
                            No code?{" "}
                            <Link href={`/dashboard/competitions/${slug}/teams`} className="font-semibold text-brand-600 hover:underline">
                              Browse teams looking for members →
                            </Link>
                          </p>
                        </ActionForm>
                      ) : null}
                      {soloAllowed ? (
                        <ActionForm action={startSoloAction.bind(null, c.id)} className="space-y-4">
                          <h3 className="font-bold">{teamAllowed ? "Or participate individually" : "Start your project"}</h3>
                          <TextInput label="Working title" name="title" required />
                          <Select label="Challenge" name="challengeId" placeholder="Choose later" options={challenges} />
                          <SubmitButton variant={teamAllowed ? "outline" : "primary"}>Start individual project</SubmitButton>
                        </ActionForm>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {/* Stages & submissions */}
          <section>
            <h2 className="mb-4 text-lg font-bold">Timeline & submissions</h2>
            <ol className="space-y-4">
              {w.stages.map(({ stage, fields, submission, result, feedback }) => {
                const st = STAGE_STATUS_META[stage.status];
                const open = stage.status === "OPEN" && stage.acceptsSubmissions;
                const late = stage.endsAt && stage.endsAt < new Date();
                const attachments = (submission?.attachments ?? []).map((a) => ({
                  id: a.id,
                  fieldKey: a.fieldKey,
                  fileName: a.fileName,
                  sizeBytes: a.sizeBytes,
                  scanStatus: a.scanStatus,
                  url: w.files[a.id] as string,
                }));
                return (
                  <li key={stage.id} className="card overflow-hidden">
                    <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{stage.name}</p>
                        <p className="text-xs text-ink-500">
                          {stage.startsAt || stage.endsAt
                            ? `${formatDateTime(stage.startsAt, tz)} → ${formatDateTime(stage.endsAt, tz)}`
                            : "Dates to be announced"}
                        </p>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {submission?.status === "SUBMITTED" ? (
                        <Badge tone="success">
                          <Icon name="check" className="h-3.5 w-3.5" /> Submitted v{submission.version}
                          {submission.isLate ? " (late)" : ""}
                        </Badge>
                      ) : submission ? (
                        <Badge tone="warning">Draft</Badge>
                      ) : null}
                      {result ? <Badge tone={DECISION_META[result.decision].tone}>{DECISION_META[result.decision].label}</Badge> : null}
                    </div>
                    <div className="space-y-4 px-5 py-4">
                      {stage.description ? <p className="text-sm text-ink-600">{stage.description}</p> : null}
                      {stage.acceptsSubmissions && project && approved ? (
                        open ? (
                          <>
                            {late ? (
                              <Alert tone="warning">
                                The deadline has passed{stage.allowLateSubmissions ? "; late submissions are accepted and will be marked as late." : "."}
                              </Alert>
                            ) : null}
                            <SubmissionForm
                              action={saveSubmissionAction.bind(null, stage.id)}
                              fields={fields}
                              content={(submission?.content ?? {}) as Record<string, string | boolean>}
                              attachments={attachments}
                              canSubmit={w.isLeader}
                              alreadySubmitted={submission?.status === "SUBMITTED"}
                              locked={false}
                              maxMb={maxMb}
                            />
                          </>
                        ) : submission ? (
                          <SubmissionForm
                            action={saveSubmissionAction.bind(null, stage.id)}
                            fields={fields}
                            content={(submission.content ?? {}) as Record<string, string | boolean>}
                            attachments={attachments}
                            canSubmit={false}
                            alreadySubmitted
                            locked
                            maxMb={maxMb}
                          />
                        ) : stage.status === "PENDING" ? (
                          <p className="text-sm text-ink-500">Submissions open when this stage starts.</p>
                        ) : (
                          <p className="text-sm text-ink-500">No submission was made for this stage.</p>
                        )
                      ) : null}
                      {submission?.versions.length ? (
                        <details className="text-sm">
                          <summary className="cursor-pointer font-semibold text-ink-700">Version history ({submission.versions.length})</summary>
                          <ul className="mt-2 space-y-1 text-ink-500">
                            {submission.versions.map((v) => (
                              <li key={v.version}>
                                Version {v.version} · {formatDateTime(v.createdAt, tz)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {feedback.length ? (
                        <div className="rounded-xl bg-brand-50/60 p-4">
                          <p className="text-sm font-bold text-brand-900">Judges' feedback</p>
                          <ul className="mt-2 space-y-2 text-sm text-ink-700">
                            {feedback.map((f, i) => (
                              <li key={i}>“{f.feedbackToTeam}”</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Showcase */}
          {project && w.isLeader && w.stages.some((s) => s.submission?.status === "SUBMITTED") ? (
            <Card>
              <CardHeader
                title="Project showcase"
                description="Ask the organizer to feature your project publicly. Nothing is published without their approval."
                action={<Badge>{project.showcaseStatus.toLowerCase()}</Badge>}
              />
              <div className="p-5">
                {project.showcaseStatus === "PUBLISHED" || project.showcaseStatus === "REQUESTED" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-ink-600">
                      {project.showcaseStatus === "PUBLISHED" ? "Your project is public in the showcase." : "Waiting for organizer approval."}
                    </p>
                    {project.showcaseStatus === "PUBLISHED" ? (
                      <ButtonLink href={`/projects/${project.id}`} size="sm" variant="outline">
                        View
                      </ButtonLink>
                    ) : null}
                    <ConfirmAction
                      action={withdrawShowcaseAction.bind(null, project.id)}
                      label="Withdraw from showcase"
                      title="Withdraw from the showcase?"
                      confirmLabel="Withdraw"
                    />
                  </div>
                ) : (
                  <ActionForm action={requestShowcaseAction.bind(null, project.id)} className="space-y-4">
                    <TextArea label="Public summary" name="showcaseSummary" required defaultValue={project.showcaseSummary ?? project.summary} rows={3} />
                    <TextArea label="Outcome & impact" name="showcaseImpact" defaultValue={project.showcaseImpact ?? ""} rows={2} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextInput label="Public demo URL" name="demoUrl" type="url" defaultValue={project.demoUrl ?? ""} />
                      <TextInput label="Public repository URL" name="repoUrl" type="url" defaultValue={project.repoUrl ?? ""} />
                    </div>
                    <Checkbox
                      name="showMembers"
                      label="Show team member names (only members who allow showcase visibility in their privacy settings are listed)"
                      defaultChecked={project.showMembers}
                    />
                    <SubmitButton variant="outline">Request publication</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          {qr ? (
            <Card className="p-5 text-center">
              <p className="text-sm font-bold">Event check-in</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`Check-in QR code ${reg.checkInCode}`} className="mx-auto mt-3 h-40 w-40" />
              <p className="mt-2 font-mono text-sm font-bold tracking-wider">{reg.checkInCode}</p>
              <p className="mt-1 text-xs text-ink-500">
                {w.attendance ? `Checked in ${formatDateTime(w.attendance.checkedInAt, tz)}` : "Show this at the registration desk."}
              </p>
            </Card>
          ) : null}
          {w.slots.length ? (
            <Card>
              <CardHeader title="Your presentation slots" />
              <ul className="divide-y divide-ink-100 text-sm">
                {w.slots.map((s) => (
                  <li key={s.id} className="px-5 py-3">
                    <p className="font-semibold">{s.stage?.name ?? "Presentation"}</p>
                    <p className="text-ink-500">
                      {formatDateTime(s.startsAt, tz)}
                      {s.room ? ` · ${s.room}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Announcements" />
            {w.announcements.length ? (
              <ul className="divide-y divide-ink-100">
                {w.announcements.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {a.pinned ? <Badge tone="brand">Pinned</Badge> : null}
                      {a.title}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{a.body}</p>
                    <p className="mt-1 text-[11px] text-ink-400">{relativeFromNow(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-500">No announcements yet.</p>
            )}
          </Card>
          {w.mentorNotes.length ? (
            <Card>
              <CardHeader title="Mentor feedback" />
              <ul className="divide-y divide-ink-100">
                {w.mentorNotes.map((n) => (
                  <li key={n.id} className="px-5 py-3 text-sm">
                    <p className="whitespace-pre-line text-ink-700">{n.body}</p>
                    <p className="mt-1 text-xs text-ink-400">
                      {n.mentor.name} · {relativeFromNow(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {c.sessions.length ? (
            <Card>
              <CardHeader title="Schedule" description={`Times in ${tz}`} />
              <ul className="divide-y divide-ink-100 text-sm">
                {c.sessions.map((s) => (
                  <li key={s.id} className="px-5 py-3">
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-ink-500">{formatDateTime(s.startsAt, tz)}</p>
                    {s.meetingUrl ? (
                      <a href={s.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-600 hover:underline">
                        Join link
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {w.certificates.length ? (
            <Card className="p-5">
              <p className="font-bold">Certificates</p>
              <ButtonLink href="/dashboard/certificates" size="sm" variant="outline" className="mt-3">
                View {w.certificates.length} certificate{w.certificates.length > 1 ? "s" : ""}
              </ButtonLink>
            </Card>
          ) : null}
          {c.hiringEnabled && reg.status !== "WITHDRAWN" ? (
            <CareerCard competitionId={c.id} openings={openings} consent={consent} approved={approved} timeZone={tz} />
          ) : null}
          <Card>
            <CardHeader title="Need help?" description="Send a question to the organizers." />
            <div className="p-5">
              <ActionForm action={supportRequestAction} resetOnSuccess className="space-y-3">
                <input type="hidden" name="competitionId" value={c.id} />
                <TextInput label="Subject" name="subject" required />
                <TextArea label="Message" name="body" required rows={3} />
                <SubmitButton size="sm" variant="outline">
                  Send request
                </SubmitButton>
              </ActionForm>
              {w.supportRequests.length ? (
                <ul className="mt-5 space-y-3 border-t border-ink-100 pt-4 text-sm">
                  {w.supportRequests.map((r) => (
                    <li key={r.id}>
                      <p className="font-semibold">
                        {r.subject} <Badge tone={r.status === "RESOLVED" ? "success" : "warning"}>{r.status.toLowerCase().replace("_", " ")}</Badge>
                      </p>
                      {r.response ? <p className="mt-1 text-ink-600">Organizer: {r.response}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
          {reg.status !== "WITHDRAWN" && c.status === "PUBLISHED" ? (
            <ConfirmAction
              action={withdrawAction.bind(null, c.id, slug)}
              label="Withdraw from competition"
              variant="ghost"
              title="Withdraw from this competition?"
              description="You will leave your team and your registration will be withdrawn. You may be able to register again while registration is open."
              confirmLabel="Withdraw"
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
