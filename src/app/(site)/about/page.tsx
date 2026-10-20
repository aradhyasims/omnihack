import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description: "Why OmniHack exists and the principles it is built on.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About OmniHack"
        title="One platform for the whole innovation-competition lifecycle."
        description="OmniHack is an independent platform for organizing, judging and certifying ideathons and hackathons."
      />
      <section className="py-16">
        <div className="container-page grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="prose-om">
            <h2 className="text-2xl font-extrabold text-ink-950">Why we built it</h2>
            <p className="mt-4">
              Competitions are run with spreadsheets, form tools, shared drives and email threads. That makes them hard to run, hard to judge fairly and hard to
              trust. OmniHack replaces that patchwork with a single, configurable workflow that keeps data private by default and every decision on the record.
            </p>
            <p>
              Organizers configure stages instead of commissioning software for each event. Participants get one place for registration, teams and submissions.
              Judges score against published rubrics. Anyone can verify a certificate.
            </p>
          </div>
          <div className="space-y-4">
            {[
              ["Fair by design", "Published criteria, deterministic ranking and audited corrections."],
              ["Private by default", "Submissions are only visible to the team, assigned judges and authorized organizers."],
              ["Honest by default", "No fabricated statistics or testimonials; demo data is always labelled."],
              ["Built to last", "Modular architecture, versioned migrations and documented upgrade paths."],
            ].map(([t, d]) => (
              <div key={t} className="card p-5">
                <p className="font-bold">{t}</p>
                <p className="mt-1 text-sm text-ink-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="container-page mt-12">
          <ButtonLink href="/contact">Get in touch</ButtonLink>
        </div>
      </section>
    </>
  );
}
