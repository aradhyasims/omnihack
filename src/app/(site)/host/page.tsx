import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/primitives";
import { PageHero } from "@/components/site/page-hero";
import { BANK_TRANSFER_METHODS, HOSTING_FEE } from "@/config/payments";
import { brand } from "@/config/brand";

const formatInr = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);

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
          <a
            href="#pricing"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-white/25 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10"
          >
            Pricing: {formatInr(HOSTING_FEE.amountMinor)} per competition
          </a>
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
      <section id="pricing" className="scroll-mt-24 py-20">
        <div className="container-page grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="eyebrow">Pricing</div>
            <h2 className="mt-2 text-3xl font-extrabold">One simple hosting fee per competition</h2>
            <p className="mt-4 text-[15px] leading-7 text-ink-600">
              Set up your draft for free. When you&apos;re ready to go live, pay the hosting fee by bank transfer and submit the transaction reference from your
              competition&apos;s overview. Once OmniHack verifies the payment, your competition is enabled.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink-700">
              {[
                "Publish your ideathon or hackathon",
                "Browse the mentor & jury directory and add judges and mentors",
                "Every platform feature: teams, judging, results, certificates, analytics and hiring",
                "Optional entry fees paid by participants directly into your own bank account",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card overflow-hidden">
            <div className="bg-ink-950 p-8 text-white">
              <p className="text-sm font-semibold text-ink-300">Hosting fee</p>
              <p className="mt-2 font-display text-5xl font-extrabold">{formatInr(HOSTING_FEE.amountMinor)}</p>
              <p className="mt-1 text-sm text-ink-300">per competition · paid once</p>
            </div>
            <dl className="divide-y divide-ink-100 text-sm">
              {[
                ["How to pay", `Bank transfer (${BANK_TRANSFER_METHODS}) to ${HOSTING_FEE.payee.accountName}`],
                ["When", "Before publishing — you can prepare everything first"],
                ["Entry fees", "Set your own; participants pay you directly and you verify each payment"],
                ["Questions", brand.contact.generalEmail],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-1 px-6 py-4 sm:grid-cols-[8rem_1fr]">
                  <dt className="font-semibold text-ink-900">{k}</dt>
                  <dd className="text-ink-600">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
      <section className="border-t border-ink-100 py-20">
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
