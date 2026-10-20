import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-500">Enter your account email and we'll send you a link to choose a new password.</p>
      <ActionForm action={forgotPasswordAction} className="mt-8 space-y-5" resetOnSuccess refresh={false}>
        <TextInput label="Email" name="email" type="email" autoComplete="email" required />
        <SubmitButton size="lg" className="w-full" pendingLabel="Sending…">
          Send reset link
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/auth/login" className="font-semibold text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
