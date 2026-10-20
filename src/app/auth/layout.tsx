import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <main id="main" className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-xs text-ink-400">
          <Link href="/privacy" className="hover:text-ink-700">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-ink-700">
            Terms
          </Link>
        </p>
      </main>
      <aside className="relative hidden overflow-hidden bg-ink-950 lg:block" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-brand-600/30 blur-[120px]" />
        <div className="absolute -bottom-40 left-10 h-[420px] w-[420px] rounded-full bg-accent-500/20 blur-[120px]" />
        <div className="relative flex h-full flex-col justify-between p-14 text-white">
          <Logo inverted href={null} className="h-12 self-start" />
          <div>
            <p className="font-display text-4xl font-extrabold leading-tight">
              Register. Build. Get judged fairly.
              <br />
              <span className="text-accent-300">Get certified.</span>
            </p>
            <p className="mt-4 max-w-md text-ink-300">One account for every ideathon and hackathon you join, judge, mentor or organize on OmniHack.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
