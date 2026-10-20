# Placement & recruitment

OmniHack lets companies hire through competitions: **Challenge → Build → Prove → Hire**. Participants decide whether hiring partners can see them, per competition. Companies see the work and verified achievements behind a candidate instead of a CV alone.

## Where it appears

| Audience     | Place                                                                    | What                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Everyone     | Header and footer → **Careers**; homepage "Careers through competitions" | Links to open roles and the hiring pitch                                                                                                      |
| Everyone     | `/opportunities`                                                         | Active openings from public, published competitions with hiring switched on. Search, type and work-mode filters                               |
| Everyone     | `/competitions?hiring=1`, "Hiring" badge on cards                        | Competitions that have hiring partners                                                                                                        |
| Everyone     | `/competitions/[slug]` → "Internships & jobs"                            | The competition's openings and hiring note                                                                                                    |
| Companies    | `/hire`, `/contact?topic=HIRING`                                         | Hiring formats, candidate commitments, FAQ, enquiry form                                                                                      |
| Participants | Competition workspace → "Career opportunities"                           | Join or leave the talent pool, preferences, CV upload                                                                                         |
| Participants | `/dashboard/opportunities` (sidebar "Internships & jobs", with a badge)  | Shortlists, interview invitations and offers; accept, decline or withdraw                                                                     |
| Organizers   | Console → **Hiring** tab                                                 | Talent pool, pipeline, openings, settings, placement stats. Recruiters are added on the **People** page with the Recruiter role and a company |

## Roles and permissions

| Who                            | `hiring.manage` (settings, openings) | `talent.view` (pool, profiles, pipeline) | Scope                    |
| ------------------------------ | ------------------------------------ | ---------------------------------------- | ------------------------ |
| Competition / org owner        | ✅                                   | ✅                                       | All companies            |
| Org coordinator                | ✅                                   | ❌ (data minimization)                   | Openings for any company |
| Recruiter (competition role)   | ✅                                   | ✅                                       | **Their company only**   |
| Judges, mentors, ops, auditors | ❌                                   | ❌                                       | —                        |

A recruiter must have a company set. Their openings, shortlists and pipeline are forced to that company, and they never see other companies' applications. A recruiter cannot also be a registered participant in the same competition.

## Candidate journey

1. **Opt in.** Once the registration is approved and hiring is enabled, the participant confirms they are 18 or older and gives explicit consent. They choose the opportunity types (internship, pre-placement offer, full-time, contract), locations, availability, graduation year, an optional PDF CV of up to 5 MB, and whether to share their submitted project.
2. **Shortlisted.** A recruiter shortlists the candidate for an opening, or as general interest. The candidate is notified in-app and by email, and their email address becomes visible to that company.
3. **Interview.** The recruiter sends a time (in the competition's time zone) and the format or link. The candidate accepts.
4. **Offer.** The recruiter sends the offer type and details. The candidate accepts or declines. The formal offer letter is sent by the company outside OmniHack.
5. **Closed.** The application ends as accepted, declined, not selected, or withdrawn by the candidate.

Every transition is stored as an `ApplicationEvent` with the actor and an optional message. Both sides are notified.

## What recruiters see — and never see

- **Visible:** name, headline, institution, skills, the candidate's stated preferences, CV (signed link valid for 10 minutes, audited), certificates (verifiable by code), the project and submissions if `sharePortfolio` is on, and published awards.
- **After results are published (configurable):** a coarse rank band — Top 10% / 25% / 50% / Finalist.
- **Only once shortlisted by that company:** the email address.
- **Never:** participants who did not opt in, judging scores, judge comments, other companies' pipelines, or recruiters' private notes. Notes are visible only to the hiring team and are stripped from candidate responses.

Profile views, CV downloads, shortlists and status changes are written to the audit log.

## Withdrawal

Leaving the talent pool:

- hides the profile immediately;
- deletes the CV from storage;
- closes open applications as **withdrawn**;
- notifies the recruiters involved.

Accepted or declined offers stay as history.

## Placement analytics

Shown in the Hiring tab, scoped to the company for recruiters:

- opt-in rate;
- open positions;
- the shortlisted → interview → offer → accepted funnel;
- accepted offers by type and by institution;
- median days to first response and to an accepted offer;
- a 14-day response SLA warning for shortlisted candidates still waiting.

## Data model

`JobOpening`, `TalentConsent` (unique per competition and user), `CandidateApplication` (unique per competition, candidate and opening; `openingKey` is `general` for general interest) and `ApplicationEvent`. Competition settings are `hiringEnabled`, `hiringNote` and `showRankBandToRecruiters`. The code is in `src/server/modules/talent/service.ts`.

## Demo data

`npm run db:seed` adds `recruiter@omnihack.example`, a recruiter for "Example Tech (Demo)". It also enables hiring on three demo competitions, creates openings and talent-pool members, and adds one complete pipeline ending in an accepted pre-placement offer in the Open Data Hackathon. Everything is labelled "(Demo)". The hiring seed also runs on databases seeded before this feature existed.

## Not included

- **Success-fee or per-hire billing.** This depends on the payments integration, which is disabled.
- **ATS integrations** (Greenhouse, Lever and similar) and calendar invites.
- **Placement-cell (TPO) reporting across competitions.** Today the stats are per competition.
