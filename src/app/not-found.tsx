import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <Logo />
        <p className="mt-10 font-display text-7xl font-extrabold text-brand-600">404</p>
        <h1 className="mt-3 text-2xl font-extrabold">This page doesn't exist — or isn't public.</h1>
        <p className="mt-2 text-ink-500">Private competitions and drafts are only visible to their organizers.</p>
        <div className="mt-8 flex justify-center gap-3 text-sm font-semibold">
          <Link href="/" className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700">
            Home
          </Link>
          <Link href="/competitions" className="rounded-lg border border-ink-200 px-4 py-2 hover:bg-ink-50">
            Browse competitions
          </Link>
        </div>
      </div>
    </main>
  );
}
