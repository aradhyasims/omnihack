import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Checkbox, SubmitButton, TextInput } from "@/components/ui/form";
import { registerAction } from "../actions";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.intent === "host" ? "/organizer" : sp.next;
  return (
    <div>
      <h1 className="text-3xl font-extrabold">{sp.intent === "host" ? "Start organizing" : "Create your account"}</h1>
      <p className="mt-2 text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
      <ActionForm action={registerAction} className="mt-8 space-y-5" refresh={false}>
        <input type="hidden" name="next" value={next ?? ""} />
        <TextInput label="Full name" name="name" autoComplete="name" required />
        <TextInput label="Email" name="email" type="email" autoComplete="email" required hint="We'll send a link to verify this address." />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 10 characters, with letters and a number or symbol."
        />
        <Checkbox
          name="acceptTerms"
          label={
            <>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-brand-600 hover:underline">
                terms of use
              </Link>{" "}
              and have read the{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-brand-600 hover:underline">
                privacy notice
              </Link>
              .
            </>
          }
        />
        <SubmitButton size="lg" className="w-full" pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
