import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { verifyEmail } from "@/server/auth/service";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  let ok = false;
  let message = "This verification link is missing its token.";
  if (token) {
    try {
      await verifyEmail(token);
      ok = true;
    } catch (e) {
      message = isAppError(e) ? e.message : "We couldn't verify your email. Please request a new link.";
    }
  }
  return (
    <div>
      <h1 className="text-3xl font-extrabold">{ok ? "Email verified" : "Verification failed"}</h1>
      <Alert tone={ok ? "success" : "danger"} className="mt-6">
        {ok ? "Thanks — your email address is confirmed. You can now register for competitions and create organizations." : message}
      </Alert>
      <ButtonLink href="/dashboard" className="mt-6">
        Go to dashboard
      </ButtonLink>
    </div>
  );
}
