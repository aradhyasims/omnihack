import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Welcome back</h1>
      <p className="mt-2 text-sm text-ink-500">
        New to OmniHack?{" "}
        <Link href={`/auth/register${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="font-semibold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
      {sp.reset ? (
        <Alert tone="success" className="mt-6">
          Your password was changed. Sign in with your new password.
        </Alert>
      ) : null}
      {sp.expired ? (
        <Alert tone="warning" className="mt-6">
          Your session expired. Please sign in again.
        </Alert>
      ) : null}
      <ActionForm action={loginAction} className="mt-8 space-y-5" refresh={false}>
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <TextInput label="Email" name="email" type="email" autoComplete="email" required />
        <TextInput label="Password" name="password" type="password" autoComplete="current-password" required />
        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-sm font-semibold text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton size="lg" className="w-full" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </ActionForm>
      {process.env.NODE_ENV !== "production" ? (
        <p className="mt-8 rounded-xl bg-ink-50 p-4 text-xs leading-5 text-ink-500">
          <strong className="text-ink-700">Development only:</strong> demo accounts such as organizer@omnihack.example, judge1@omnihack.example and
          alice@omnihack.example use the password set in SEED_ADMIN_PASSWORD.
        </p>
      ) : null}
    </div>
  );
}
