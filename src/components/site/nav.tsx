"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/primitives";

export type NavGroup = { label: string; href?: string; items?: { label: string; href: string; description: string; icon: string }[] };

export const NAV: NavGroup[] = [
  {
    label: "Explore",
    items: [
      { label: "Competitions", href: "/competitions", description: "Browse open ideathons and hackathons", icon: "search" },
      { label: "Winners", href: "/winners", description: "Published results and award winners", icon: "trophy" },
      { label: "Project showcase", href: "/projects", description: "Approved projects from past events", icon: "layers" },
    ],
  },
  {
    label: "Careers",
    items: [
      { label: "Internships & jobs", href: "/opportunities", description: "Roles you can earn by competing", icon: "briefcase" },
      { label: "Hire through hackathons", href: "/hire", description: "For companies: recruit from real work", icon: "users" },
    ],
  },
  {
    label: "For organizers",
    items: [
      { label: "Host a competition", href: "/host", description: "Run ideathons and hackathons end to end", icon: "bolt" },
      { label: "Resources", href: "/resources", description: "Guides for organizers, judges and teams", icon: "file" },
      { label: "Verify a certificate", href: "/verify", description: "Check a certificate ID", icon: "certificate" },
    ],
  },
  { label: "FAQ", href: "/faq" },
  { label: "About", href: "/about" },
  { label: "Mentorship", href: "/mentorship" },
];

function Dropdown({ group, active }: { group: NavGroup; active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition hover:text-ink-950",
          active ? "text-ink-950" : "text-ink-600",
        )}
      >
        {group.label}
        <Icon name="chevron" className={cn("h-4 w-4 transition", open && "rotate-180")} />
      </button>
      <div className={cn("absolute left-1/2 top-full z-40 w-80 -translate-x-1/2 pt-2 transition", open ? "visible opacity-100" : "invisible opacity-0")}>
        <div className="card p-2">
          {group.items!.map((item) => (
            <Link key={item.href} href={item.href} className="flex gap-3 rounded-lg p-3 transition hover:bg-ink-50">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">{item.label}</span>
                <span className="block text-xs leading-5 text-ink-500">{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {NAV.map((g) =>
        g.items ? (
          <Dropdown key={g.label} group={g} active={g.items.some((i) => pathname.startsWith(i.href))} />
        ) : (
          <Link
            key={g.href}
            href={g.href!}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition hover:text-ink-950",
              pathname.startsWith(g.href!) ? "text-ink-950" : "text-ink-600",
            )}
          >
            {g.label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 place-items-center rounded-lg text-ink-800 hover:bg-ink-100"
      >
        <Icon name={open ? "close" : "menu"} />
      </button>
      {open ? (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-white px-4 pb-10 pt-4">
          <nav aria-label="Mobile" className="space-y-6">
            {NAV.map((g) => (
              <div key={g.label}>
                {g.items ? (
                  <>
                    <div className="eyebrow mb-2 px-2">{g.label}</div>
                    {g.items.map((i) => (
                      <Link
                        key={i.href}
                        href={i.href}
                        className="flex items-center gap-3 rounded-lg px-2 py-3 text-base font-semibold text-ink-900 hover:bg-ink-50"
                      >
                        <Icon name={i.icon} className="text-brand-600" />
                        {i.label}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link href={g.href!} className="block rounded-lg px-2 py-3 text-base font-semibold text-ink-900 hover:bg-ink-50">
                    {g.label}
                  </Link>
                )}
              </div>
            ))}
            <Link href="/contact" className="block rounded-lg px-2 py-3 text-base font-semibold text-ink-900 hover:bg-ink-50">
              Contact
            </Link>
            <div className="grid gap-2 border-t border-ink-100 pt-6">
              {signedIn ? (
                <Link href="/dashboard" className={buttonClass("primary", "lg")}>
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link href="/auth/register" className={buttonClass("primary", "lg")}>
                    Create free account
                  </Link>
                  <Link href="/auth/login" className={buttonClass("outline", "lg")}>
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
