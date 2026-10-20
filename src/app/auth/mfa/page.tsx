import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import { getSession } from "@/server/auth/current";
import { logoutAction, mfaAction } from "../actions";

export const metadata: Metadata = { title: "Two-factor verification", robots: { index: false } };

export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (!session.user.mfaEnabledAt || session.mfaVerified) redirect("/dashboard");
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Two-factor verification</h1>
      <p className="mt-2 text-sm text-ink-500">Enter the 6-digit code from your authenticator app for {session.user.email}.</p>
      <ActionForm action={mfaAction} className="mt-8 space-y-5" refresh={false}>
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <TextInput
          label="Authentication code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
        />
        <SubmitButton size="lg" className="w-full" pendingLabel="Verifying…">
          Verify
        </SubmitButton>
      </ActionForm>
      <form action={logoutAction} className="mt-4 text-center">
        <button className="text-sm font-semibold text-ink-500 hover:text-ink-800">Use a different account</button>
      </form>
    </div>
  );
}
