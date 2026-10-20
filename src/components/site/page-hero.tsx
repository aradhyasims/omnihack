import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  description,
  children,
  dark = false,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  dark?: boolean;
}) {
  return (
    <section className={dark ? "relative overflow-hidden bg-ink-950 text-white" : "border-b border-ink-100 bg-ink-50/60"}>
      {dark ? <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_75%)]" aria-hidden /> : null}
      <div className="container-page relative py-16 sm:py-20">
        <div className={dark ? "text-xs font-semibold uppercase tracking-[0.14em] text-accent-300" : "eyebrow"}>{eyebrow}</div>
        <h1 className={`mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl ${dark ? "text-white" : ""}`}>{title}</h1>
        {description ? <p className={`mt-5 max-w-2xl text-lg leading-8 ${dark ? "text-ink-300" : "text-ink-500"}`}>{description}</p> : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}
