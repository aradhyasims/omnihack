import type { Metadata } from "next";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Choose a new password</h1>
      {!token ? (
        <Alert tone="danger" className="mt-6">
          This reset link is incomplete. Request a new one.
        </Alert>
      ) : (
        <ActionForm action={resetPasswordAction} className="mt-8 space-y-5" refresh={false}>
          <input type="hidden" name="token" value={token} />
          <TextInput
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 10 characters, with letters and a number or symbol."
          />
          <TextInput label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
          <SubmitButton size="lg" className="w-full" pendingLabel="Saving…">
            Save new password
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
