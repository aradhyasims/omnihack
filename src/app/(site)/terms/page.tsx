import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";

export const metadata: Metadata = { title: "Terms of use", description: "Terms for using the OmniHack platform.", alternates: { canonical: "/terms" } };

const SECTIONS: [string, string][] = [
  ["Template terms", "These terms are a starting template and must be reviewed by the operator's legal counsel before production use."],
  [
    "Accounts",
    "You are responsible for activity on your account and for keeping your credentials secure. Provide accurate information, especially where it determines eligibility.",
  ],
  [
    "Competitions",
    "Each competition is run by its organizer under its own rules, which you accept when registering. The organizer, not OmniHack, decides eligibility, judging outcomes and prizes.",
  ],
  [
    "Your content",
    "You keep ownership of what you submit unless a competition's published intellectual-property terms say otherwise. You grant OmniHack the limited rights needed to store and display your content to the people authorized to see it.",
  ],
  [
    "Acceptable use",
    "Do not submit work you don't have rights to, malicious files, or content that is unlawful or harassing. Do not attempt to access other users' data or bypass security controls.",
  ],
  [
    "Certificates",
    "Certificates confirm what is recorded on the platform. Organizers may revoke certificates issued in error; verification will then show the revocation.",
  ],
  ["Availability & changes", "We aim for reliable service but do not guarantee uninterrupted availability. We may update these terms with notice."],
];

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms of use" />
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
