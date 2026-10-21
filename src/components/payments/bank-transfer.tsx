import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import { BANK_TRANSFER_METHODS } from "@/config/payments";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Bank account to pay into, with the amount, laid out so each value is easy to copy. */
export function BankDetails({
  amount,
  accountName,
  accountNumber,
  ifsc,
  bank,
  branch,
  upiId,
}: {
  amount: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bank: string;
  branch?: string | null;
  upiId?: string | null;
}) {
  const rows = [
    ["Account name", accountName],
    ["Account number", accountNumber],
    ["IFSC code", ifsc],
    ["Bank", bank],
    ...(branch ? [["Branch", branch]] : []),
    ...(upiId ? [["UPI ID", upiId]] : []),
  ];
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
      <p className="text-sm text-ink-600">
        Transfer <strong className="font-display text-lg text-ink-950">{amount}</strong> by {BANK_TRANSFER_METHODS}
        {upiId ? " or UPI" : ""} to:
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase text-ink-500">{k}</dt>
            <dd className="select-all font-mono font-semibold text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "I've paid" form: the payer reports the transfer so the receiving side can match it on their statement. */
export function TransferForm({
  action,
  submitLabel = "Submit payment details",
  withNote = true,
}: {
  action: Action;
  submitLabel?: string;
  withNote?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Transaction reference (UTR)"
          name="utr"
          required
          autoComplete="off"
          placeholder="e.g. 427812345678"
          hint="Shown in your bank app or statement for this transfer"
        />
        <TextInput label="Payment date" name="paidOn" type="date" required max={today} />
        <TextInput label="Paid from account of" name="payerName" required autoComplete="name" hint="Account holder name, as on the transfer" />
        {withNote ? <TextInput label="Note (optional)" name="note" maxLength={500} /> : null}
      </div>
      <SubmitButton pendingLabel="Sending…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
