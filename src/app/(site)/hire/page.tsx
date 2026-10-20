import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/primitives";
import { FaqList } from "@/components/site/faq-list";

export const metadata: Metadata = {
  title: "Hire through hackathons",
  description:
    "Recruit interns and graduates through ideathons and hackathons: real problem statements, mentored work, fair judging and consent-based talent pools.",
  alternates: { canonical: "/hire" },
};

const STEPS = [
  [
    "Sponsor a challenge",
    "Post a real problem statement, dataset or API, and declare the roles you are hiring for — internships, pre-placement offers or full-time.",
    "idea",
  ],
  ["Participants build", "Teams work on your challenge with your engineers as mentors. You see how candidates think, collaborate and ship.", "code"],
  [
    "Fair, structured judging",
    "Weighted rubrics, conflict-of-interest controls and deterministic rankings — your hiring signal is evidence, not a CV keyword match.",
    "gavel",
  ],
  [
    "Consent-based talent pool",
    "Only participants who opt in are visible to you, with their portfolio, certificates and (after results) a rank band.",
    "shield",
  ],
  ["Shortlist, interview, offer", "Move candidates through a simple pipeline. Every candidate is notified at each step — no silent rejections.", "briefcase"],
  ["Measure outcomes", "Opt-in rate, interviews, offers, acceptances, time-to-hire and response times in one placement report.", "chart"],
];

const FORMATS = [
  ["Hiring hackathon", "One company runs the event end to end for its own roles. Best signal per candidate.", "Company-run"],
  [
    "Campus placement drive",
    "A university hosts; several companies each sponsor a track. Pre-placement offers complement or replace the coding test.",
    "College + companies",
  ],
  ["Open innovation challenge", "Mixed sponsors solve real problems; talent-pool access is a secondary benefit for partners.", "Multi-sponsor"],
];

const FAQS = [
  {
    q: "Which candidates can we see?",
    a: "Only participants aged 18+ with an approved registration who explicitly opted into the talent pool for that competition. They can withdraw at any time; their profile then disappears and their CV is deleted.",
  },
  {
    q: "Do we see judges' scores?",
    a: "No. Scores and judges' comments stay confidential. After results are officially published you see a coarse rank band (for example Top 10%) and any awards — if the organizer enables it.",
  },
  {
    q: "When do we get candidate contact details?",
    a: "Once a candidate is in your pipeline (shortlisted). All shortlists, profile views and CV downloads are recorded in the audit log.",
  },
  {
    q: "Can several companies recruit in one competition?",
    a: "Yes. Each recruiter is linked to their company and only sees their own company's pipeline; the talent pool itself is shared among the competition's hiring partners, as participants are told when they opt in.",
  },
  {
    q: "Who owns the work participants build?",
    a: "Participants keep their intellectual property unless the competition's published IP terms say otherwise. Define this before the event in the rules step.",
  },
];

export default function HirePage() {
  return (
    <>
      <PageHero
        dark
        eyebrow="For companies & recruiters"
        title="Hire people who have already solved your problem."
        description="Run hiring hackathons and campus placement drives on OmniHack. Mentor candidates on real challenges, judge their work fairly, and recruit from a consent-based talent pool."
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/contact?topic=HIRING" size="lg" className="bg-brand-500 hover:bg-brand-400">
            Talk to us about hiring
          </ButtonLink>
          <ButtonLink href="/opportunities" size="lg" variant="light">
            See live openings
          </ButtonLink>
        </div>
      </PageHero>

      <section className="py-20">
        <div className="container-page">
          <div className="eyebrow">How it works</div>
          <h2 className="mt-2 text-3xl font-extrabold">Challenge → Build → Prove → Hire</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([t, d, icon], i) => (
              <li key={t} className="card relative p-6">
                <span className="absolute right-5 top-5 font-mono text-xs text-ink-300">0{i + 1}</span>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon name={icon} />
                </span>
                <h3 className="mt-5 text-lg font-bold">{t}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-ink-100 bg-ink-50/60 py-20">
        <div className="container-page">
          <div className="eyebrow">Formats</div>
          <h2 className="mt-2 text-3xl font-extrabold">Three ways to recruit</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {FORMATS.map(([t, d, tag]) => (
              <div key={t} className="card p-6">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-600">{tag}</span>
                <h3 className="mt-2 text-xl font-extrabold">{t}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page grid gap-10 lg:grid-cols-2">
          <div>
            <div className="eyebrow">Mentors from your team</div>
            <h2 className="mt-2 text-3xl font-extrabold">Mentoring is your best interview</h2>
            <p className="mt-4 text-[15px] leading-7 text-ink-600">
              Add your engineers as mentors. They run office hours, leave feedback teams can act on, and see how candidates respond to guidance — the signal a
              one-hour interview can't give. To keep judging fair, the same person should not both mentor and judge a team, and conflicts of interest are
              declared in the platform.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink-700">
              {[
                "Verifiable mentor certificates for your staff",
                "Mentor sessions on the event schedule with meeting links",
                "Feedback history visible to the team (and to you if the candidate shares their portfolio)",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Icon name="check" className="mt-0.5 h-4 w-4 text-brand-600" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-ink-950 p-8 text-white">
            <h2 className="text-2xl font-extrabold text-white">Our commitments to candidates</h2>
            <ul className="mt-6 space-y-3 text-sm text-ink-200">
              {[
                "Free for students — no pay-to-play.",
                "Explicit, per-competition opt-in; withdraw any time.",
                "18+ only in the talent pool.",
                "Roles and compensation published up front.",
                "Every shortlisted candidate gets a response — we track response times.",
                "Sponsorship never influences judging.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Icon name="shield" className="mt-0.5 h-4 w-4 text-accent-300" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-ink-50/60 py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <div className="eyebrow">FAQ for recruiters</div>
            <h2 className="mt-2 text-3xl font-extrabold">Privacy and fairness, built in</h2>
          </div>
          <FaqList items={FAQS} />
        </div>
      </section>

      <section className="py-20">
        <div className="container-page text-center">
          <h2 className="text-3xl font-extrabold">Plan a hiring hackathon or campus drive</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-500">Tell us your roles, timeline and campuses. Packages and pricing are tailored to the format.</p>
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink href="/contact?topic=HIRING" size="lg">
              Contact the hiring team
            </ButtonLink>
            <ButtonLink href="/host" size="lg" variant="outline">
              Host a competition
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
