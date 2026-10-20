import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { ActionForm, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { brand } from "@/config/brand";
import { contactAction } from "./actions";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the OmniHack team about hosting, support, partnerships or privacy.",
  alternates: { canonical: "/contact" },
};

const TOPICS = [
  { value: "GENERAL", label: "General question" },
  { value: "HOST_DEMO", label: "Hosting / demo request" },
  { value: "HIRING", label: "Hiring & internships (companies)" },
  { value: "SUPPORT", label: "Participant support" },
  { value: "PARTNERSHIP", label: "Partnerships" },
  { value: "PRIVACY", label: "Privacy request" },
];

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to us" description="Questions about hosting a competition, taking part, or your data — we read every message." />
      <section className="py-16">
        <div className="container-page grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <ActionForm action={contactAction} resetOnSuccess className="card space-y-5 p-6 sm:p-8" refresh={false}>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextInput label="Name" name="name" required autoComplete="name" />
              <TextInput label="Email" name="email" type="email" required autoComplete="email" />
              <TextInput label="Organization" name="organization" autoComplete="organization" />
              <Select label="Topic" name="topic" options={TOPICS} defaultValue={TOPICS.some((t) => t.value === sp.topic) ? sp.topic : "GENERAL"} />
            </div>
            <TextArea label="Message" name="message" required rows={6} />
            {/* Honeypot field for bots — hidden from people and assistive tech */}
            <div className="hidden" aria-hidden>
              <label>
                Website <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <p className="text-xs text-ink-500">We use your details only to respond to this message. See the privacy notice.</p>
            <SubmitButton size="lg" pendingLabel="Sending…">
              Send message
            </SubmitButton>
          </ActionForm>
          <div className="space-y-4 text-sm">
            {[
              ["General", brand.contact.generalEmail],
              ["Support", brand.contact.supportEmail],
              ["Privacy", brand.contact.privacyEmail],
            ].map(([k, v]) => (
              <div key={k} className="card p-5">
                <p className="font-bold">{k}</p>
                <a className="text-brand-600 hover:underline" href={`mailto:${v}`}>
                  {v}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
