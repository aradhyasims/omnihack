import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How OmniHack collects, uses and protects personal data.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS: [string, string][] = [
  [
    "Template notice",
    "This privacy notice is a starting template written to describe how this software behaves. It must be reviewed by the operator's legal counsel and adapted to the jurisdictions where OmniHack is offered before production use.",
  ],
  [
    "What we collect",
    "Account data (name, email, hashed password), optional profile data you choose to add (headline, skills, institution, links), registration answers requested by a competition organizer, team membership, submissions and files you upload, and records of judging, results, certificates and attendance. We store hashed, not raw, IP references for security logs.",
  ],
  [
    "Why we use it",
    "To run competitions you take part in (registration, eligibility, teams, submissions, judging, results and certificates), to secure accounts and detect abuse, to send service notifications, and — only with your consent — to email you about new competitions.",
  ],
  [
    "Who can see it",
    "Submissions are private by default: visible to your team, the competition's authorized organizers and the judges or mentors assigned to your project. Judges do not see your contact details. Public pages show only what organizers publish (e.g. winners) and, for the showcase, only member names of people who opted in.",
  ],
  [
    "Minors",
    "Organizers may set age requirements. Age is only collected when a competition requires it and is used solely to check eligibility. Organizers running events for minors are responsible for obtaining any parental consent required by law.",
  ],
  [
    "Retention",
    "Competition records (including issued certificates, so they remain verifiable) are retained for the life of the competition record. Deactivated accounts can no longer sign in. You may request deletion or correction; some records may be retained where required for legal, audit or certificate-verification purposes.",
  ],
  [
    "Your rights",
    "You can view and edit your profile, download a copy of your data from your profile page, change privacy preferences at any time, and deactivate your account. For other requests contact " +
      brand.contact.privacyEmail +
      ".",
  ],
  [
    "Third parties",
    "Email delivery, file storage and (if enabled) payments are provided by processors under contract. Confidential submissions are not sent to AI providers or other third parties without the organizer's explicit authorization.",
  ],
  [
    "Security",
    "Passwords are hashed with scrypt, sessions use HTTP-only cookies, private files are served through short-lived signed links after authorization checks, and administrative actions are recorded in an audit log.",
  ],
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy notice" />
      <div className="container-page max-w-3xl space-y-8 py-16">
        {SECTIONS.map(([t, d]) => (
          <section key={t}>
            <h2 className="text-xl font-extrabold">{t}</h2>
            <p className="prose-om mt-2">{d}</p>
          </section>
        ))}
      </div>
    </>
  );
}
