"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function TabNav({ items, base }: { items: { href: string; label: string }[]; base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Competition sections" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-ink-100 whitespace-nowrap">
        {items.map((t) => {
          const href = `${base}${t.href}`;
          const active = t.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={t.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2.5 text-sm font-semibold transition",
                  active ? "border-brand-600 text-ink-950" : "border-transparent text-ink-500 hover:text-ink-800",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
