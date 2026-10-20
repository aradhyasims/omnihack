"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/primitives";
import { Logo } from "@/components/brand/logo";

export type SideItem = { href: string; label: string; icon: string; badge?: number; exact?: boolean };
export type SideGroup = { label?: string; items: SideItem[] };

function NavLinks({ groups }: { groups: SideGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="space-y-6">
      {groups.map((g, i) => (
        <div key={i}>
          {g.label ? <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">{g.label}</div> : null}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active ? "bg-white text-ink-950 shadow-sm ring-1 ring-ink-100" : "text-ink-600 hover:bg-white/70 hover:text-ink-900",
                    )}
                  >
                    <Icon name={item.icon} className={cn("h-[18px] w-[18px]", active ? "text-brand-600" : "text-ink-400")} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge > 99 ? "99+" : item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar({ groups, footer }: { groups: SideGroup[]; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-100 bg-white px-4 lg:hidden">
        <Logo href="/dashboard" />
        <button
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="grid h-10 w-10 place-items-center rounded-lg hover:bg-ink-100"
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
      {open ? <div className="fixed inset-0 z-30 bg-ink-950/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-100 bg-ink-50 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center px-5">
          <Logo href="/" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks groups={groups} />
        </div>
        <div className="border-t border-ink-100 p-3">{footer}</div>
      </aside>
    </>
  );
}
