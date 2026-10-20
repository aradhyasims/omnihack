import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { FaqList } from "@/components/site/faq-list";
import { PLATFORM_FAQ } from "@/content/faq";

export const metadata: Metadata = { title: "FAQ", description: "Frequently asked questions about OmniHack.", alternates: { canonical: "/faq" } };

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PLATFORM_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHero eyebrow="FAQ" title="Frequently asked questions" />
      <div className="container-page max-w-3xl py-16">
        <FaqList items={PLATFORM_FAQ} />
        <p className="mt-8 text-sm text-ink-500">
          Still have a question?{" "}
          <Link href="/contact" className="font-semibold text-brand-600 hover:underline">
            Contact us
          </Link>
          .
        </p>
      </div>
    </>
  );
}
