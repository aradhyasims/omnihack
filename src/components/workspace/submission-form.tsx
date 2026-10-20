"use client";

import { ActionForm, Checkbox, FieldErrorText, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";
import type { ResolvedField } from "@/server/modules/submissions/fields";

type Attachment = { id: string; fieldKey: string; fileName: string; sizeBytes: number; url: string; scanStatus: string };

const ACCEPT = ".pdf,.pptx,.docx,.xlsx,.zip,.png,.jpg,.jpeg,.webp,.txt,.md";

export function SubmissionForm({
  action,
  fields,
  content,
  attachments,
  canSubmit,
  alreadySubmitted,
  locked,
  maxMb,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  fields: ResolvedField[];
  content: Record<string, string | boolean>;
  attachments: Attachment[];
  canSubmit: boolean;
  alreadySubmitted: boolean;
  locked: boolean;
  maxMb: number;
}) {
  return (
    <ActionForm action={action} className="space-y-5">
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
        {fields.map((f) => {
          const label = (
            <>
              {f.label}
              {!f.required && f.type !== "checkbox" ? <span className="ml-1 font-normal text-ink-400">(optional)</span> : null}
            </>
          );
          if (f.type === "textarea")
            return (
              <TextArea
                key={f.key}
                label={label}
                name={`field_${f.key}`}
                errorKey={f.key}
                required={f.required}
                defaultValue={String(content[f.key] ?? "")}
                hint={f.help}
                maxLength={f.maxLength}
                rows={4}
              />
            );
          if (f.type === "text" || f.type === "url")
            return (
              <TextInput
                key={f.key}
                label={label}
                name={`field_${f.key}`}
                errorKey={f.key}
                type={f.type === "url" ? "url" : "text"}
                required={f.required}
                defaultValue={String(content[f.key] ?? "")}
                hint={f.help}
                maxLength={f.maxLength}
                placeholder={f.type === "url" ? "https://" : undefined}
              />
            );
          if (f.type === "checkbox")
            return (
              <div key={f.key}>
                <Checkbox label={label} name={`field_${f.key}`} defaultChecked={content[f.key] === true} />
                <FieldErrorText name={f.key} />
              </div>
            );
          const existing = attachments.filter((a) => a.fieldKey === f.key);
          return (
            <div key={f.key}>
              <label className="mb-1.5 block text-sm font-semibold text-ink-800" htmlFor={`file_${f.key}`}>
                {label}
                {f.required ? <span className="ml-0.5 text-rose-600">*</span> : null}
              </label>
              {existing.length ? (
                <ul className="mb-2 space-y-1.5">
                  {existing.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2 text-sm">
                      <a href={a.url} className="font-medium text-brand-700 hover:underline">
                        {a.fileName}
                      </a>
                      <span className="text-xs text-ink-400">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
                      {!alreadySubmitted ? (
                        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-500">
                          <input type="checkbox" name="removeAttachment" value={a.id} className="accent-rose-600" /> Remove
                        </label>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <input
                id={`file_${f.key}`}
                type="file"
                name={`file_${f.key}`}
                multiple
                accept={f.type === "images" ? ".png,.jpg,.jpeg,.webp" : ACCEPT}
                className="block w-full rounded-lg border border-dashed border-ink-300 bg-white px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700"
              />
              <p className="mt-1.5 text-xs text-ink-500">
                {f.help ? `${f.help} ` : ""}Up to {maxMb} MB per file. Files are private to your team, organizers and assigned judges.
              </p>
              <FieldErrorText name={f.key} />
            </div>
          );
        })}
      </fieldset>
      {!locked ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5">
          {!alreadySubmitted ? (
            <SubmitButton variant="outline" name="intent" value="draft" pendingLabel="Saving…">
              Save draft
            </SubmitButton>
          ) : null}
          {canSubmit ? (
            <SubmitButton name="intent" value="submit" pendingLabel="Submitting…">
              {alreadySubmitted ? "Submit updated version" : "Submit final version"}
            </SubmitButton>
          ) : (
            <span className="text-xs text-ink-500">Only the team leader can submit the final version.</span>
          )}
        </div>
      ) : null}
    </ActionForm>
  );
}
