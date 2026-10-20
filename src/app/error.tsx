"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-ink-500">We couldn't load this page. Your data has not been changed. Please try again in a moment.</p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-ink-400">Reference: {error.digest}</p> : null}
        <div className="mt-6 flex justify-center gap-3 text-sm font-semibold">
          <button onClick={reset} className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700">
            Try again
          </button>
          <Link href="/" className="rounded-lg border border-ink-200 px-4 py-2 hover:bg-ink-50">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
