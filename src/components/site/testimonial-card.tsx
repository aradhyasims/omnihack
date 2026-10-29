import type { Testimonial } from "@prisma/client";

export const TESTIMONIAL_LABEL: Record<string, string> = {
  INSTITUTION: "Institution",
  COMPANY: "Company",
  RECRUITMENT: "Hired through a hackathon",
  PARTICIPANT: "Participant",
  MENTOR: "Mentor",
  OTHER: "Partner",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function TestimonialCard({
  t,
  dark = false,
}: {
  t: Pick<Testimonial, "quote" | "authorName" | "authorTitle" | "organization" | "category">;
  dark?: boolean;
}) {
  return (
    <figure className={`flex h-full flex-col rounded-2xl p-6 ${dark ? "bg-white/[0.06] text-white ring-1 ring-white/10" : "card"}`}>
      <span className={`text-xs font-bold uppercase tracking-[0.12em] ${dark ? "text-accent-300" : "text-brand-600"}`}>{TESTIMONIAL_LABEL[t.category]}</span>
      <blockquote className={`mt-3 flex-1 text-[15px] leading-7 ${dark ? "text-ink-100" : "text-ink-700"}`}>
        <span aria-hidden className={`mr-0.5 font-display text-2xl leading-none ${dark ? "text-accent-300" : "text-brand-500"}`}>
          “
        </span>
        {t.quote}
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white"
          aria-hidden
        >
          {initials(t.authorName)}
        </span>
        <span className="min-w-0">
          <span className={`block text-sm font-bold ${dark ? "text-white" : "text-ink-900"}`}>{t.authorName}</span>
          <span className={`block text-xs ${dark ? "text-ink-300" : "text-ink-500"}`}>
            {t.authorTitle ? `${t.authorTitle}, ` : ""}
            {t.organization}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
