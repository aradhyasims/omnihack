# OmniHack

OmniHack is a platform for running ideathons, hackathons and hybrid idea-to-prototype competitions from start to finish. It covers the public website, competition discovery, a 10-step creation wizard, a configurable stage engine, registration with eligibility checks, teams, versioned private submissions, multi-round judging, results approval and publication, certificates with QR verification, event-day operations, analytics, and platform administration.

> **Status:** a working application with persistent data, server-side authorization and automated tests (89 unit and integration, 25 browser). SMTP email, S3 storage and ClamAV malware scanning are implemented and switch on through environment variables once you supply the accounts. Payments and AI stay **disabled** until providers are chosen. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Quick start (local development)

Requirements: Node.js 22 or later. No Docker or system PostgreSQL is needed, because development uses an embedded PostgreSQL that installs through npm.

```bash
npm install
cp .env.example .env              # then set APP_SECRET and ENCRYPTION_KEY (commands are in the file)
npm run db:start                  # terminal 1: starts PostgreSQL on :5433 (keep it running)
npx prisma migrate deploy         # terminal 2: applies the migrations
npm run db:seed                   # loads clearly labelled demo data (refuses to run in production)
npm run dev                       # http://localhost:3000
```

Demo accounts (development only) all use the password in `SEED_ADMIN_PASSWORD` (default `OmniHack!Demo2026`):

| Account                                         | Role                                          |
| ----------------------------------------------- | --------------------------------------------- |
| `admin@omnihack.example`                        | Platform super administrator                  |
| `organizer@omnihack.example`                    | Organization owner and competition owner      |
| `coordinator@omnihack.example`                  | Organization coordinator and event operations |
| `judge1@`, `judge2@`, `judge3@omnihack.example` | Judges                                        |
| `mentor@omnihack.example`                       | Mentor                                        |
| `alice@` … `henry@omnihack.example`             | Participants                                  |

Emails are written to the outbox table and printed to the server console in development. Use them to follow verification and invitation links; administrators can also see them under **Admin → System**.

## Scripts

| Command                                                       | Purpose                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                             | Next.js development server, production build, and production server       |
| `npm run worker` / `build:worker` / `start:worker`            | Background worker (jobs, email outbox, reminders)                         |
| `npm run db:start`                                            | Embedded development PostgreSQL                                           |
| `npm run db:migrate` / `db:deploy` / `db:seed`                | Create a migration, apply migrations, seed demo data                      |
| `npm test`                                                    | Unit and integration tests (Vitest, against the `omnihack_test` database) |
| `npm run test:e2e`                                            | Browser end-to-end tests (Playwright; desktop and mobile)                 |
| `npm run typecheck` / `npx eslint .` / `npm run format:check` | Static checks                                                             |
| `npm run backup` / `npm run restore`                          | Logical database backup and restore (see docs/OPERATIONS.md)              |
| `node scripts/load-test.mjs [seconds] [connections]`          | HTTP load test against a production build (`BASE_URL`)                    |

## Project layout

```
prisma/              schema.prisma, versioned migrations, development seed
src/app/             Next.js App Router: (site) public pages, (app) dashboards, auth, api/v1 REST
src/components/      design system (ui/), brand, site chrome, feature components
src/server/          framework-independent domain layer
  authz.ts           permission model (platform, organization and competition roles)
  modules/           competitions, stages, registrations, teams, submissions, judging,
                     results, certificates, operations, mentoring, showcase, analytics,
                     admin, participants, optional/{payments,ai}
  auth/ notifications/ jobs/ storage/
tests/               unit/, integration/ (end-to-end scenarios at the service level), e2e/ (Playwright)
infra/               Terraform for AWS and deployment scripts (not yet applied to a real account)
docs/                architecture, routes, security, deployment, operations, test results, …
```

## Documentation

| Document                                       | Contents                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE](docs/ARCHITECTURE.md)           | Stack decisions (including why the domain runs inside Next.js instead of NestJS), modules, data model, upgrade strategy |
| [ROUTES](docs/ROUTES.md)                       | Route and API inventory                                                                                                 |
| [DESIGN-SYSTEM](docs/DESIGN-SYSTEM.md)         | Brand, tokens, components, reference-site observations                                                                  |
| [SCORING](docs/SCORING.md)                     | Exact scoring, ranking, tie-break and advancement rules                                                                 |
| [RECRUITMENT](docs/RECRUITMENT.md)             | Placement & recruitment: talent pool, recruiter role, pipeline, privacy rules                                           |
| [SECURITY](docs/SECURITY.md)                   | Security controls, privacy and data governance, ASVS mapping                                                            |
| [DEPLOYMENT](docs/DEPLOYMENT.md)               | Installation, environment variables, migrations, production deployment                                                  |
| [OPERATIONS](docs/OPERATIONS.md)               | Backups and recovery (tested), monitoring, incident runbooks, rollback                                                  |
| [FEATURE-MATRIX](docs/FEATURE-MATRIX.md)       | What is complete, partial, or not implemented                                                                           |
| [TEST-RESULTS](docs/TEST-RESULTS.md)           | Test evidence from the build                                                                                            |
| [LIMITATIONS](docs/LIMITATIONS.md)             | Known limitations, required external services and credentials, future work                                              |
| [VISUAL-COMPARISON](docs/VISUAL-COMPARISON.md) | Reference-site observations compared with the OmniHack implementation                                                   |

The API reference is served at `/api/docs`, with the OpenAPI spec at `/api/v1/openapi.json`.
