import { Icon } from "@/components/ui/primitives";

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-left text-[15px] font-semibold text-ink-900">
            {f.q}
            <Icon name="chevron" className="h-5 w-5 text-ink-400 transition group-open:rotate-180" />
          </summary>
          <p className="mt-3 whitespace-pre-line pr-8 text-sm leading-6 text-ink-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
