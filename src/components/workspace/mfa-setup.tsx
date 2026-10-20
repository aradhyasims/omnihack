"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";

export function MfaSetup({ begin, confirm }: { begin: () => Promise<ActionState>; confirm: (s: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, run] = useActionState(async () => begin(), {} as ActionState);
  const data = state.data as { secret: string; qr: string } | undefined;
  if (!data) {
    return (
      <form action={run}>
        {state.error ? <p className="mb-3 text-sm text-rose-700">{state.error}</p> : null}
        <SubmitButton variant="outline" pendingLabel="Preparing…">
          Set up authenticator app
        </SubmitButton>
      </form>
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border border-ink-100" />
      <div>
        <p className="text-sm text-ink-600">Scan the QR code with an authenticator app, or enter this key manually:</p>
        <p className="mt-2 break-all rounded-lg bg-ink-50 px-3 py-2 font-mono text-sm">{data.secret}</p>
        <ActionForm action={confirm} className="mt-4 space-y-3">
          <TextInput label="6-digit code" name="code" inputMode="numeric" maxLength={6} required />
          <SubmitButton>Enable two-factor authentication</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
