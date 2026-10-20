import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/primitives";
import { PageHero } from "@/components/site/page-hero";

export const metadata: Metadata = {
  title: "Host a competition",
  description: "Run ideathons, hackathons and idea-to-prototype challenges end to end with OmniHack.",
  alternates: { canonical: "/host" },
};

const FEATURES = [
  [
    "Event creation in a guided wizard",
    "Ten steps from basics to publication: format, delivery, eligibility, challenges, dates, prizes, rubrics and rules. Save drafts and preview the public page at any time.",
    "bolt",
  ],
  [
    "Registration management",
    "Eligibility checks for participant type, age (only when needed), institution and geography; custom questions; manual review with waitlisting; capacity limits.",
    "users",
  ],
  [
    "Teams & projects",
    "Invite links and email invitations, team-size validation, leadership transfer, roster approval, and one project record per team that carries idea → prototype history.",
    "layers",
  ],
  [
    "Judging workflows",
    "Weighted rubrics, balanced auto-assignment, conflict-of-interest declarations, autosaving scorecards, locked finals, audited corrections and deterministic rankings.",
    "gavel",
  ],
  [
    "Results & certificates",
    "Provisional → approved → published results, public winner pages, and bulk PDF certificates with QR verification, revocation and reissue.",
    "certificate",
  ],
  [
    "Analytics & reporting",
    "Registrations, institutions, team formation, stage progression, evaluation completion, attendance and certificates — with CSV exports.",
    "chart",
  ],
  [
    "Event-day operations",
    "Schedules, QR check-in, authorized manual overrides, presentation slots, announcements and support requests in one operations dashboard.",
    "qr",
  ],
  [
    "Security & privacy",
    "Server-side permission checks on every action, private-by-default submissions, signed file links, MFA for privileged accounts and a full audit log.",
    "shield",
  ],
  [
    "Placement & recruitment",
    "Publish internships, pre-placement offers and jobs; invite recruiters; let participants opt into a talent pool; track shortlists, interviews, offers and placement outcomes.",
    "briefcase",
  ],
];

export default function HostPage() {
  return (
    <>
      <PageHero
        dark
        eyebrow="For organizers"
        title="Host competitions that run themselves — fairly."
        description="OmniHack gives corporates, universities and communities a configurable engine for ideathons and hackathons, from the first registration to the last certificate."
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/auth/register?intent=host" size="lg" className="bg-brand-500 hover:bg-brand-400">
            Start organizing
          </ButtonLink>
          <ButtonLink href="/contact?topic=HOST_DEMO" size="lg" variant="light">
            Request a demo
          </ButtonLink>
        </div>
      </PageHero>
      <section className="py-20">
        <div className="container-page grid gap-6 md:grid-cols-2">
          {FEATURES.map(([title, text, icon]) => (
            <div key={title} className="card flex gap-5 p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name={icon} />
              </span>
              <div>
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-600">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="border-y border-ink-100 bg-ink-50/60 py-20">
        <div className="container-page grid gap-10 lg:grid-cols-3">
          {[
            ["Ideathon", "Registration → idea submission → preliminary evaluation → pitch round → finalists → final presentation → results → certificates."],
            [
              "Hackathon",
              "Registration & teams → development sprint → optional checkpoint → final submission & technical judging → live demos → results → certificates.",
            ],
            [
              "Idea → prototype",
              "Ideas are judged first; shortlisted teams keep their project record and build a prototype with a separate rubric and combined history.",
            ],
          ].map(([t, d]) => (
            <div key={t}>
              <h3 className="text-xl font-extrabold">{t}</h3>
              <p className="mt-3 text-sm leading-6 text-ink-600">{d}</p>
              <p className="mt-2 text-xs text-ink-500">Every stage can be renamed, reordered, enabled or disabled.</p>
            </div>
          ))}
        </div>
      </section>
      <section className="py-20">
        <div className="container-page text-center">
          <h2 className="text-3xl font-extrabold">Ready to launch?</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-500">
            Create an organization and a draft competition in minutes. New organizations are reviewed before their first event goes live.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink href="/auth/register?intent=host" size="lg">
              Create organizer account
            </ButtonLink>
            <ButtonLink href="/resources" size="lg" variant="outline">
              Read the organizer guide
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
