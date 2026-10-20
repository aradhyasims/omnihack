# Route inventory

✅ means implemented and covered by a smoke test (HTTP status check and/or Playwright). Access: **Public**, **Auth** (any signed-in user), **Perm** (a permission or assignment that is checked server-side).

## Public website

| Route                                                                                      | Purpose                                                                                                                                         | Access           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `/`                                                                                        | Homepage: hero, featured ideathons and hackathons, deadlines, categories, how it works, benefits, judges and mentors, winners, FAQ, CTA         | ✅ Public        |
| `/competitions`                                                                            | Search and filters (type, status, format, eligibility, participation, fee, deadline, category, organizer) using URL parameters, with pagination | ✅ Public        |
| `/competitions/[slug]`                                                                     | Full event page (staff see a preview of drafts; 404 for everyone else)                                                                          | ✅ Public        |
| `/competitions/[slug]/register`                                                            | Registration with eligibility checks and custom questions                                                                                       | ✅ Auth          |
| `/competitions/[slug]/results`                                                             | Published winners and finalists (no scores)                                                                                                     | ✅ Public        |
| `/host`                                                                                    | Organizer capabilities and CTAs                                                                                                                 | ✅ Public        |
| `/about`, `/contact`, `/resources`, `/faq`, `/privacy`, `/terms`                           | Supporting pages (the contact form is stored for admins)                                                                                        | ✅ Public        |
| `/winners`                                                                                 | Published results across competitions                                                                                                           | ✅ Public        |
| `/projects`, `/projects/[id]`                                                              | Approved project showcase                                                                                                                       | ✅ Public        |
| `/verify`, `/verify/[code]`                                                                | Certificate verification (rate-limited, minimal data)                                                                                           | ✅ Public        |
| `/invite/[token]`                                                                          | Team invitation acceptance                                                                                                                      | ✅ Public / Auth |
| `/auth/login`, `/register`, `/mfa`, `/verify-email`, `/forgot-password`, `/reset-password` | Authentication                                                                                                                                  | ✅ Public        |
| `/opportunities`                                                                           | Internships, pre-placement offers and jobs from hiring partners (search, type and work-mode filters)                                            | ✅ Public        |
| `/hire`                                                                                    | Hiring through competitions: model, formats, candidate commitments, FAQ, CTA                                                                    | ✅ Public        |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image`                                          | SEO                                                                                                                                             | ✅ Public        |

## Participant, judge and mentor area

| Route                                                   | Purpose                                                                                                                          | Access                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `/dashboard`                                            | Overview: competitions, updates, invitations, role shortcuts                                                                     | ✅ Auth                   |
| `/dashboard/competitions/[slug]`                        | Participant workspace: status, team, stage timeline, submissions, feedback, announcements, slots, QR check-in, showcase, support | ✅ Registered participant |
| `/dashboard/notifications`, `/certificates`, `/profile` | Notifications; certificate downloads; profile, privacy, MFA, sessions, data export, deactivation                                 | ✅ Auth                   |
| `/dashboard/judging`, `/dashboard/judging/[id]`         | Judge dashboard and scorecard                                                                                                    | ✅ Assigned judge only    |
| `/dashboard/mentoring`                                  | Mentor dashboard                                                                                                                 | ✅ Assigned mentor        |
| `/dashboard/opportunities`                              | Shortlists, interview invitations and offers (accept, decline, withdraw); talent-pool memberships                                | ✅ Auth (own only)        |

## Organizer console

| Route                          | Purpose                                                            | Permission                              |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------------------- |
| `/organizer`                   | Organizations, members, managed competitions                       | Auth                                    |
| `/organizer/competitions/new`  | Create a draft (choose format)                                     | Organization owner or coordinator       |
| `/organizer/competitions/[id]` | Overview, publish checklist, lifecycle actions, status history     | Any staff permission                    |
| `…/edit?step=1–10`             | Creation wizard                                                    | `competition.edit`                      |
| `…/stages`                     | Stage engine and rubrics                                           | `stage.manage`                          |
| `…/registrations`              | Review, approve, waitlist, reject; CSV export                      | `registration.review`                   |
| `…/teams`                      | Teams, rosters, submissions, disqualification                      | `team.manage` / `submission.view_all`   |
| `…/people`                     | Staff, judges, mentors; mentor assignment                          | `staff.manage` / `mentor.assign`        |
| `…/judging`                    | Assignments, completion, ranking, decisions, corrections           | `judge.assign` / `evaluation.view_all`  |
| `…/results`                    | Prizes, winners, prepare / approve / publish                       | `results.*`                             |
| `…/certificates`               | Template, bulk issue, revoke, reissue                              | `certificate.issue`                     |
| `…/operations`                 | Check-in desk, schedule, slots, announcements, support, volunteers | `attendance.manage` / `schedule.manage` |
| `…/analytics`                  | Metrics and CSV exports                                            | `analytics.view`                        |
| `…/showcase`                   | Showcase moderation                                                | `showcase.moderate`                     |
| `…/hiring`                     | Talent pool, pipeline, openings, hiring settings, placement stats  | `talent.view` / `hiring.manage`         |
| `…/hiring/candidates/[userId]` | Consenting candidate profile, CV, certificates, shared project     | `talent.view` (audited)                 |
| `…/audit`                      | Competition audit log                                              | `audit.view`                            |

## Platform administration (`/admin/*`)

Overview, approvals, users (super admins can change roles), organizations (verification), competitions (featuring), inquiries, audit log, and system (integration status, email outbox, jobs). Requires a platform `ADMIN` or `SUPER_ADMIN` role, plus MFA when `REQUIRE_ADMIN_MFA=true`.

## REST API (`/api`)

See `/api/docs` (rendered from `/api/v1/openapi.json`).

| Method & path                                                                                            | Access                                                 |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /api/health`                                                                                        | Public                                                 |
| `GET /api/v1/competitions`, `GET /api/v1/competitions/{slug}`, `GET /api/v1/competitions/{slug}/results` | Public                                                 |
| `POST /api/v1/competitions/{slug}/registrations`                                                         | Auth                                                   |
| `GET /api/v1/me`, `/me/registrations`, `/me/notifications`, `POST /me/notifications`, `GET /me/export`   | Auth                                                   |
| `GET /api/v1/projects/{id}/submissions`, `GET /api/v1/files/{id}?exp&sig`                                | Members, assigned judges and mentors, authorized staff |
| `GET /api/v1/judging/assignments`                                                                        | Auth (own assignments only)                            |
| `GET /api/v1/talent/resume/{id}?exp&sig`                                                                 | Candidate or `talent.view` while consent is active     |
| `GET /api/v1/certificates/{code}/verify`                                                                 | Public (rate-limited)                                  |
| `GET /api/v1/certificates/{code}/pdf`                                                                    | Recipient or certificate issuer                        |
| `GET /api/v1/organizer/competitions/{id}/export/{kind}`                                                  | Relevant permission                                    |
| `POST /api/v1/payments/webhook`                                                                          | Returns 503 until payments are configured              |
| `GET /media/public/...`                                                                                  | Public uploaded banners and logos only                 |
