import { PARTNER_GROUPS } from "@/content/partners";

/**
 * Homepage partner logos: one auto-scrolling row per group, alternating direction.
 * Pauses on hover/focus; with reduced motion the logos simply wrap and stay still.
 */
export function LogoMarquee() {
  return (
    <div className="space-y-8">
      {PARTNER_GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-ink-500">{g.title}</h3>
          <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
            <ul
              className={`flex w-max gap-5 py-1 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center ${
                g.direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
              } motion-reduce:animate-none`}
            >
              {[0, 1].map((copy) =>
                g.logos.map((l) => (
                  <li key={`${copy}-${l.file}`} aria-hidden={copy === 1} className={copy === 1 ? "motion-reduce:hidden" : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- static partner logos, sized by height */}
                    <img
                      src={`/partners/${l.file}`}
                      alt={copy === 0 ? l.name : ""}
                      title={l.name}
                      decoding="async"
                      className="h-20 w-auto max-w-none rounded-xl bg-white sm:h-24"
                    />
                  </li>
                )),
              )}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
