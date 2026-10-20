"use client";

// Form system: <ActionForm> runs a server action with useActionState and shares its result through
// context so fields can render their own errors. Works without JavaScript too (progressive enhancement).
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ComponentProps,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { buttonClass } from "./button";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>({});
export const useFormState = () => useContext(FormStateContext);
const PendingContext = createContext(false);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  successMessage = true,
  refresh = true,
  onSuccessHref,
  ...rest
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: boolean;
  refresh?: boolean;
  onSuccessHref?: string;
} & Omit<ComponentProps<"form">, "action" | "children">) {
  const [state, formAction, isPending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  // Submit via a transition instead of the native form action so React does not reset the form:
  // users keep what they typed when the server returns validation errors.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
  useEffect(() => {
    if (!state.ts) return;
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      if (onSuccessHref) router.push(onSuccessHref);
      else if (refresh) router.refresh();
    } else if (state.fieldErrors) {
      const first = Object.keys(state.fieldErrors)[0];
      const el = first ? ref.current?.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`) : null;
      el?.focus();
    }
  }, [state.ts]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FormStateContext.Provider value={state}>
      <PendingContext.Provider value={isPending}>
        <form ref={ref} action={formAction} onSubmit={onSubmit} className={className} noValidate {...rest}>
          <FormMessage showSuccess={successMessage} />
          {children}
        </form>
      </PendingContext.Provider>
    </FormStateContext.Provider>
  );
}

export function FormMessage({ showSuccess = true }: { showSuccess?: boolean }) {
  const state = useFormState();
  if (state.error) {
    const extra = state.fieldErrors?._eligibility || state.fieldErrors?._form;
    return (
      <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        <p className="font-semibold">{state.error}</p>
        {extra && extra !== state.error ? <p className="mt-1">{extra}</p> : null}
      </div>
    );
  }
  if (showSuccess && state.ok && state.message) {
    return (
      <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
        {state.message}
      </div>
    );
  }
  return null;
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  formNoValidate,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  className?: string;
  name?: string;
  value?: string;
  formNoValidate?: boolean;
}) {
  const status = useFormStatus();
  const transitionPending = useContext(PendingContext);
  const pending = status.pending || transitionPending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formNoValidate={formNoValidate}
      disabled={pending}
      aria-busy={pending}
      className={buttonClass(variant, size, className)}
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
          {pendingLabel ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function useFieldError(name: string) {
  return useFormState().fieldErrors?.[name];
}

const inputBase =
  "block w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink-900 shadow-xs placeholder:text-ink-400 transition focus:outline-none focus:ring-3 disabled:bg-ink-50 disabled:text-ink-500";
const inputOk = "border-ink-200 focus:border-brand-500 focus:ring-brand-500/15";
const inputErr = "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15";

export function Field({
  label,
  name,
  hint,
  children,
  required,
  className,
  errorKey,
}: {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  children: (p: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  required?: boolean;
  className?: string;
  errorKey?: string;
}) {
  const id = useId();
  const error = useFieldError(errorKey ?? name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-800">
        {label}
        {required ? (
          <span className="ml-0.5 text-rose-600" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children({ id, describedBy: [hintId, errId].filter(Boolean).join(" ") || undefined, invalid: Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="mt-1.5 text-xs leading-5 text-ink-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="mt-1.5 text-xs font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = { label: ReactNode; name: string; hint?: ReactNode; className?: string; errorKey?: string } & Omit<
  ComponentProps<"input">,
  "name" | "className"
>;

export function TextInput({ label, name, hint, className, required, errorKey, ...props }: InputProps) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={className} errorKey={errorKey}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          name={name}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(inputBase, invalid ? inputErr : inputOk)}
          {...props}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  name,
  hint,
  className,
  required,
  rows = 4,
  errorKey,
  ...props
}: { label: ReactNode; name: string; hint?: ReactNode; className?: string; rows?: number; errorKey?: string } & Omit<
  ComponentProps<"textarea">,
  "name" | "className"
>) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={className} errorKey={errorKey}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          name={name}
          rows={rows}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(inputBase, "leading-6", invalid ? inputErr : inputOk)}
          {...props}
        />
      )}
    </Field>
  );
}

export function Select({
  label,
  name,
  hint,
  className,
  required,
  options,
  placeholder,
  ...props
}: { label: ReactNode; name: string; hint?: ReactNode; className?: string; options: { value: string; label: string }[]; placeholder?: string } & Omit<
  ComponentProps<"select">,
  "name" | "className"
>) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          name={name}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(inputBase, "pr-8", invalid ? inputErr : inputOk)}
          {...props}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({
  label,
  name,
  hint,
  defaultChecked,
  value,
  className,
  disabled,
}: {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  defaultChecked?: boolean;
  value?: string;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className={className}>
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 accent-brand-600 focus-visible:outline-2"
        />
        <label htmlFor={id} className="text-sm leading-5 text-ink-700">
          {label}
          {hint ? <span className="mt-0.5 block text-xs text-ink-500">{hint}</span> : null}
        </label>
      </div>
      {error ? <p className="mt-1 text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}

/** Generic error display for keys that don't map to a single input (e.g. file fields). */
export function FieldErrorText({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="mt-1.5 text-xs font-medium text-rose-700">{error}</p> : null;
}
