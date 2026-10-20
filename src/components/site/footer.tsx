import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/brand/logo";

const columns = [
  {
    title: "Platform",
    links: [
      ["Competitions", "/competitions"],
      ["Host a competition", "/host"],
      ["Winners", "/winners"],
      ["Project showcase", "/projects"],
      ["Internships & jobs", "/opportunities"],
      ["Hire through hackathons", "/hire"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Guides", "/resources"],
      ["FAQ", "/faq"],
      ["Verify a certificate", "/verify"],
      ["API reference", "/api/docs"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Mentorship", "/mentorship"],
      ["Contact", "/contact"],
      ["Privacy notice", brand.legal.privacyPath],
      ["Terms of use", brand.legal.termsPath],
    ],
  },
];

export function SiteFooter() {
  const socials = Object.entries(brand.social).filter(([, url]) => Boolean(url));
  return (
    <footer className="border-t border-ink-900 bg-ink-950 text-ink-300">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <Logo inverted />
          <p className="mt-4 text-sm leading-6 text-ink-400">{brand.description}</p>
          <p className="mt-4 text-sm">
            <a className="text-ink-200 hover:text-white" href={`mailto:${brand.contact.generalEmail}`}>
              {brand.contact.generalEmail}
            </a>
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="text-sm font-semibold text-white">{col.title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-ink-400 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.legal.entityName}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href={brand.legal.privacyPath} className="hover:text-white">
              Privacy
            </Link>
            <Link href={brand.legal.termsPath} className="hover:text-white">
              Terms
            </Link>
            {socials.map(([name, url]) => (
              <a key={name} href={url} className="capitalize hover:text-white" rel="noopener noreferrer" target="_blank">
                {name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
