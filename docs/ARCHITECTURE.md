# Architecture

## Summary

OmniHack is a **modular monolith**: one deployable Next.js application, a separate background-worker process built from the same code, and one PostgreSQL database. All business rules live in a framework-independent domain layer (`src/server`). The web UI calls that layer through Server Actions, the REST API calls it through route handlers, and the integration tests call it directly.

```
Browser ──► Next.js (App Router)
              ├─ Server Components (read)  ─┐
              ├─ Server Actions (write)    ─┼─► src/server/modules/* ─► Prisma ─► PostgreSQL
              └─ /api/v1 route handlers    ─┘          │
                                                       ├─► storage driver (local disk │ S3)
Worker process ─► jobs/queue (Postgres SKIP LOCKED) ───┤
                 email outbox → provider (console │ SMTP)
                 deadline reminders, session purge
file.scan jobs → ClamAV (clamd) when MALWARE_SCANNER=clamav; daily retention purge
```

## Technology decisions

| Area              | Choice                                                                                                                 | Notes                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Frontend          | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4                                                          | As specified                                                                       |
| Backend           | **Domain layer inside Next.js** (Server Actions + REST route handlers)                                                 | **Deviation from the preferred NestJS.** See ADR-1.                                |
| Database          | PostgreSQL + Prisma 6, versioned SQL migrations                                                                        | As specified. Prisma 6 was chosen over 7 for maturity.                             |
| Validation        | zod                                                                                                                    | Every input is validated server-side                                               |
| PDFs and QR codes | pdf-lib, qrcode                                                                                                        | Pure JavaScript, no native dependencies                                            |
| Tests             | Vitest (unit and integration against real PostgreSQL), Playwright (desktop and mobile)                                 |                                                                                    |
| Local database    | `embedded-postgres` (real PostgreSQL binaries from npm)                                                                | The build machine had no Docker or PostgreSQL. Production uses managed PostgreSQL. |
| Deployment        | Docker image (standalone Next.js plus bundled worker); Terraform for AWS ECS Fargate, RDS, S3, CloudFront, WAF and SQS | IaC is written but has not been applied (see LIMITATIONS)                          |

### ADR-1: the domain layer lives in the Next.js app instead of a separate NestJS service

- **Context:** The brief prefers NestJS, but it also asks for a modular monolith and says not to "introduce microservices simply to appear scalable". A separate NestJS API would add a second deployable, a duplicated authentication and session layer, and cross-service types, but no capability the product needs today.
- **Decision:** Keep the domain in `src/server/modules/*` as plain TypeScript functions that take an `Actor` and validated input, perform every authorization check internally, and use Prisma. Nothing in `src/server/modules` imports Next.js; only `src/server/auth/current.ts` and `src/server/action.ts` are Next.js glue.
- **Consequences:** One deployable, shared types end to end, and services that are directly testable (the integration suite exercises them without HTTP). If team boundaries or workload later justify a separate API, the modules can move into NestJS providers mostly unchanged, with controllers wrapping the same functions. The REST API (`/api/v1`) and its OpenAPI document already exist for external clients.

### ADR-2: configurable stages instead of a hard-coded workflow

Competitions own an ordered list of `Stage` rows (13 stage types). Organizers add, rename, reorder, enable, disable and transition stages. Each stage carries its own submission template, field overrides, rubric, judge requirements, advancement rule and visibility settings. Per-format templates (`src/server/modules/stages/templates.ts`) only seed the defaults. Status transitions are validated (prerequisites, rubric validity, complete decisions) and recorded in `StageTransition`.

### ADR-3: one project record carries the idea → prototype history

A `Project` belongs to a team or a solo participant. Each stage has at most one `Submission` per project, and each submission keeps immutable `SubmissionVersion`s. Hybrid competitions therefore keep the original idea, the advancement decision (`StageResult`), the judging history and the prototype on the same project, without duplicating records. Stages marked "only advanced projects" admit only projects whose previous judged stage decision is `ADVANCED`.

### ADR-4: Postgres-backed job queue first, SQS later

Jobs use a `Job` table with `FOR UPDATE SKIP LOCKED` claiming, exponential backoff and stuck-job recovery. This is durable, transactional with domain writes, and needs no extra infrastructure. The queue functions (`enqueueJob` and `runDueJobs`) are the seam for an SQS implementation when load justifies one; Terraform already provisions the SQS queue and its dead-letter queue.

## Modules

| Module                                              | Responsibility                                                                                             | Key data                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| auth                                                | Registration, scrypt passwords, database sessions, email verification, password reset, TOTP MFA            | User, Session, UserToken                                                        |
| authz                                               | Role → permission resolution (platform, organization, competition)                                         | OrganizationMembership, CompetitionMember                                       |
| competitions                                        | Organizations, drafts, wizard steps, tracks, challenges, prizes, staff, publication lifecycle and approval | Competition, Track, Challenge, Prize, CompetitionStatusChange                   |
| stages                                              | Stage engine, transitions, rubrics, stage eligibility                                                      | Stage, StageTransition, Rubric, RubricCriterion                                 |
| registrations                                       | Eligibility evaluation, custom questions, capacity (row-locked), review                                    | Registration                                                                    |
| teams                                               | Teams, invitations, codes, leadership, locking, solo projects, history                                     | Team, TeamMembership, TeamInvitation, TeamEvent, Project                        |
| submissions                                         | Field catalog, validation, uploads, versions, view authorization, signed file URLs                         | Submission, SubmissionVersion, Attachment                                       |
| judging                                             | Assignment (manual or balanced), scorecards, conflicts, corrections, ranking, advancement                  | JudgeAssignment, Evaluation, EvaluationScore, EvaluationCorrection, StageResult |
| results                                             | Provisional → approved → published, winners, public results                                                | AwardWinner, Competition.resultsStatus                                          |
| certificates                                        | Eligibility derivation, bulk issue, PDF, verification, revoke and reissue                                  | Certificate, CertificateTemplate                                                |
| operations                                          | Schedule, check-in, attendance, presentation slots, announcements, support, operations dashboard           | EventSession, Attendance, PresentationSlot, Announcement, SupportRequest        |
| mentoring, showcase, analytics, admin, participants | As named                                                                                                   | MentorAssignment, MentorNote, …                                                 |
| notifications, jobs                                 | In-app notifications, email outbox, job queue, worker                                                      | Notification, EmailOutbox, Job                                                  |
| optional/payments, optional/ai                      | Provider-independent interfaces; disabled until configured                                                 | Payment, WebhookEvent, AiOperation                                              |

## Data model principles

- cuid identifiers, `createdAt`/`updatedAt`, explicit enums for every status machine, and indexes on filter columns.
- Unique constraints enforce invariants: one registration per user per competition, one active team membership per user per competition, one submission per project per stage, one evaluation per assignment.
- Avoid nullable columns inside unique constraints (PostgreSQL treats NULLs as distinct), for example `Certificate.distinction` defaults to `""` and `Attendance.scopeKey`.
- Critical state changes run in transactions. Capacity and team-size checks use `SELECT … FOR UPDATE` row locks. Status updates use compare-and-set (`updateMany where status = from`).
- Everything confidential is private by default. Public queries select explicit, minimal fields.

## Five-year maintainability and upgrades

- Dependencies are pinned through the lockfile, CI runs `npm audit`, and Dependabot or Renovate is recommended.
- The planned upgrade path is Next.js 15 → 16, Prisma 6 → 7 (config-file migration) and Node 22 LTS → 24 LTS. Each upgrade gets a dedicated branch with the full test suite.
- Schema changes go only through `prisma migrate dev` (reviewed SQL). Production uses `prisma migrate deploy` as a one-off task before traffic shifts. CI validates that migrations match the schema.
- The domain layer has no Next.js imports, so a framework upgrade touches only the glue code and the pages.
