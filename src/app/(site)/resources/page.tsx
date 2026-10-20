import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides for organizers, participants, judges and mentors on OmniHack, including the scoring method.",
  alternates: { canonical: "/resources" },
};

const GUIDES = [
  {
    id: "organizers",
    title: "Organizer guide",
    items: [
      "Create an organization, then a draft competition. Pick the format; a recommended stage sequence is created for you.",
      "Work through the wizard: basics, delivery, eligibility, challenges, dates, prizes, evaluation rubrics and rules. Everything saves as a draft.",
      "Publish when the checklist is clear. Verified organizations publish immediately; others are reviewed by the platform team.",
      "Run stages from the Stages tab: open submissions, close them, start judging, record advancement decisions, then complete the stage.",
      "Prepare, approve and publish results; issue certificates; export reports.",
    ],
  },
  {
    id: "participants",
    title: "Participant guide",
    items: [
      "Register for a competition. Eligibility questions are only those the organizer needs.",
      "Create a team and share its invite code, invite teammates by email, or take part individually where allowed.",
      "Save drafts any time. The team leader submits the final version; each final submission creates a new version with a timestamped confirmation.",
      "Watch your workspace for announcements, mentor feedback, advancement decisions and certificates.",
    ],
  },
  {
    id: "judges",
    title: "Judging guide",
    items: [
      "You only see projects assigned to you. Participants' contact details are hidden.",
      "Score each criterion within its range (half points allowed). Your scorecard autosaves as a draft.",
      "Declare any conflict of interest — you'll be removed from that evaluation and the organizer will reassign it.",
      "Finalize when complete. Final scores are locked; corrections can only be made by an authorized organizer, with a recorded reason.",
      "Feedback to the team may be shared with them; private notes are only for organizers.",
    ],
  },
  {
    id: "mentors",
    title: "Mentoring guide",
    items: [
      "Your Mentoring page lists the teams assigned to you and their submitted work.",
      "Leave feedback visible to the team, or private notes for yourself.",
      "Mentor sessions appear on the competition schedule with their meeting links.",
    ],
  },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero eyebrow="Resources" title="Guides & methods" description="How OmniHack works for each role, and exactly how scores become rankings." />
      <div className="container-page grid gap-10 py-16 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Guides" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="space-y-1 text-sm font-semibold">
            {[...GUIDES.map((g) => [g.id, g.title]), ["scoring", "Scoring method"]].map(([id, t]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-2 text-ink-600 hover:bg-ink-50 hover:text-ink-900">
                  {t}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-12">
          {GUIDES.map((g) => (
            <section key={g.id} id={g.id} className="scroll-mt-24">
              <h2 className="text-2xl font-extrabold">{g.title}</h2>
              <ol className="mt-5 space-y-3">
                {g.items.map((t, i) => (
                  <li key={i} className="flex gap-4 text-[15px] leading-7 text-ink-700">
                    <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <section id="scoring" className="scroll-mt-24">
            <h2 className="text-2xl font-extrabold">Scoring & tie-break method</h2>
            <div className="prose-om mt-5 space-y-4">
              <p>
                <strong>1. Weighted total per evaluation.</strong> Each criterion has a weight (all weights total 100%) and a score range. A judge's total on a
                0–100 scale is Σ weight × (score − min) ÷ (max − min).
              </p>
              <p>
                <strong>2. Project score.</strong> The mean of all finalized evaluation totals for the stage. Evaluations from judges who declared a conflict,
                and revoked assignments, are excluded.
              </p>
              <p>
                <strong>3. Ranking.</strong> Projects are ordered by score (highest first). Ties are broken, in order, by: the organizer's tie-break criteria
                (average normalized score on each, in priority order); then the earlier final submission time for the stage; then a fixed project identifier.
                Every ranked project therefore gets a unique position, and the same inputs always produce the same order.
              </p>
              <p>
                <strong>4. Advancement.</strong> Organizers choose Top N, Top %, minimum score, or manual decisions. Automatic rules require every project to
                have its minimum number of finalized evaluations, and organizers can override individual decisions before completing the stage.
              </p>
              <p>
                <strong>5. Publication.</strong> Results are provisional and private until an authorized approver approves them and they are published. Public
                pages show winners and finalists, never individual scores or judge comments.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
