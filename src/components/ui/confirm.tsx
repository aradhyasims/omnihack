"use client";

// Confirmation dialog for destructive or irreversible actions. Uses the native <dialog> element
// (focus trapping, Escape to close) and submits a server action with optional reason input.
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { buttonClass } from "./button";
import { SubmitButton } from "./form";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ConfirmAction({
  action,
  label,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "outline",
  confirmVariant = "danger",
  size = "sm",
  reasonLabel,
  reasonRequired,
  hidden,
  className,
}: {
  action: Action;
  label: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: Parameters<typeof buttonClass>[0];
  confirmVariant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  reasonLabel?: string;
  reasonRequired?: boolean;
  hidden?: Record<string, string>;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(action, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ts && state.ok) {
      ref.current?.close();
      router.refresh();
    }
  }, [state.ts]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button type="button" className={buttonClass(variant, size, className)} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(92vw,460px)] rounded-2xl border border-ink-100 p-0 shadow-2xl backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm"
      >
        <form action={formAction} className="p-6">
          <h2 className="text-lg font-bold">{title}</h2>
          {description ? <div className="mt-2 text-sm leading-6 text-ink-600">{description}</div> : null}
          {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
          {reasonLabel ? (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-semibold text-ink-800" htmlFor="confirm-reason">
                {reasonLabel}
                {reasonRequired ? <span className="text-rose-600"> *</span> : null}
              </label>
              <textarea
                id="confirm-reason"
                name="reason"
                rows={3}
                required={reasonRequired}
                className="block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>
          ) : null}
          {state.error ? (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {state.error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={buttonClass("ghost", "md")} onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <SubmitButton variant={confirmVariant} pendingLabel="Working…">
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** A one-click action button (non-destructive) that shows inline errors. */
export function InlineAction({
  action,
  children,
  variant = "outline",
  size = "sm",
  hidden,
  className,
}: {
  action: Action;
  children: ReactNode;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  hidden?: Record<string, string>;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ts && state.ok) router.refresh();
  }, [state.ts]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={formAction} className={className ?? "inline-flex flex-col items-start gap-1"}>
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <SubmitButton variant={variant} size={size} pendingLabel="…">
        {children}
      </SubmitButton>
      {state.error ? (
        <span role="alert" className="max-w-xs text-xs text-rose-700">
          {state.error}
        </span>
      ) : null}
      {state.ok && state.message ? (
        <span role="status" className="max-w-xs text-xs text-emerald-700">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
