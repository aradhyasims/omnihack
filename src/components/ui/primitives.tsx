import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "dark";

const toneClass: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200/60",
  brand: "bg-brand-50 text-brand-700 ring-brand-200/70",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  warning: "bg-amber-50 text-amber-800 ring-amber-200/70",
  danger: "bg-rose-50 text-rose-700 ring-rose-200/70",
  info: "bg-cyan-50 text-cyan-800 ring-cyan-200/70",
  dark: "bg-ink-900 text-white ring-ink-800",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", toneClass[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li" }) {
  return <As className={cn("card", className)}>{children}</As>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-cyan-200 bg-cyan-50/70 text-cyan-950",
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
    warning: "border-amber-200 bg-amber-50/80 text-amber-950",
    danger: "border-rose-200 bg-rose-50/80 text-rose-950",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", styles, className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? "mt-1" : "", "leading-6 opacity-90")}>{children}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-[15px] leading-7 text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 px-6 py-12 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-ink-100">
        {icon ?? <Icon name="spark" />}
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "success" | "warning" }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div
        className={cn(
          "mt-1.5 font-display text-2xl font-extrabold tabular-nums",
          tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-ink-950",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function Progress({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (p: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 ? (
        <Link className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium hover:bg-ink-50" href={hrefFor(page - 1)} rel="prev">
          ← Previous
        </Link>
      ) : null}
      <span className="px-2 text-sm text-ink-500">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium hover:bg-ink-50" href={hrefFor(page + 1)} rel="next">
          Next →
        </Link>
      ) : null}
    </nav>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="warning" className="uppercase tracking-wide">
      Demo data
    </Badge>
  );
}

const ICONS: Record<string, ReactNode> = {
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <path d="M16 4.5a3 3 0 0 1 0 6M17.5 14c2 .6 3.2 2.3 3.5 5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  shield: (
    <>
      <path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />,
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  certificate: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="m10.2 12 -1.2 7 3-1.6 3 1.6-1.2-7" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  gavel: (
    <>
      <path d="m14 4 6 6M11 7l6 6M12.5 5.5l-5 5 6 6 5-5M9.5 14.5 3 21" />
    </>
  ),
  mentor: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 20c1-4 3.8-6 7-6s6 2 7 6" />
      <path d="m15.5 15 1.5 2 3-3" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  code: <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />,
  idea: (
    <>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
};

export function Icon({ name, className }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
      aria-hidden
    >
      {ICONS[name] ?? ICONS.spark}
    </svg>
  );
}
