import type { Competition, Testimonial } from "@prisma/client";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { ActionForm, FieldErrorText, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm";
import { TESTIMONIAL_LABEL } from "@/components/site/testimonial-card";
import { formatDate } from "@/lib/time";
import { removeEventDocumentAction, submitEventTestimonialAction, uploadEventDocumentAction } from "../../actions";

const fileInput = "block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-700";

function DocumentSlot({
  id,
  kind,
  title,
  hint,
  current,
  currentName,
  locked,
}: {
  id: string;
  kind: "catalog" | "report";
  title: string;
  hint: string;
  current: string | null;
  currentName: string | null;
  locked?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{title}</p>
        {current ? <Badge tone="success">Public</Badge> : <Badge>Not uploaded</Badge>}
      </div>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
      {current ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <a href={`/media/${current}`} target="_blank" rel="noopener" className="font-semibold text-brand-600 hover:underline">
            {currentName ?? "View file"}
          </a>
          <ConfirmAction
            action={removeEventDocumentAction.bind(null, id, kind)}
            label="Remove"
            variant="ghost"
            title={`Remove the ${title.toLowerCase()}?`}
            description="It will no longer appear on your public event page."
            confirmLabel="Remove"
          />
        </div>
      ) : null}
      {locked ? (
        <p className="mt-3 text-sm text-ink-500">{locked}</p>
      ) : (
        <ActionForm action={uploadEventDocumentAction.bind(null, id, kind)} resetOnSuccess className="mt-3 space-y-2">
          <input
            type="file"
            name="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className={fileInput}
            aria-label={`${title} file`}
          />
          <FieldErrorText name="file" />
          <FieldErrorText name={kind} />
          <SubmitButton size="sm" variant="outline" pendingLabel="Uploading…">
            {current ? "Replace" : "Upload"}
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function EventDocumentsCard({ c, ended, testimonials }: { c: Competition; ended: boolean; testimonials: Testimonial[] }) {
  return (
    <Card>
      <CardHeader title="Event documents & testimonials" description="Shown publicly on your event page." />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <DocumentSlot
            id={c.id}
            kind="catalog"
            title="Event catalog / brochure"
            hint="PDF, JPG or PNG, up to 10 MB. Images are shown on the event page; PDFs open in a new tab."
            current={c.catalogKey}
            currentName={c.catalogName}
          />
          <DocumentSlot
            id={c.id}
            kind="report"
            title="Final report"
            hint="PDF, JPG or PNG, up to 20 MB — outcomes, winners, photos and highlights."
            current={c.reportKey}
            currentName={c.reportName}
            locked={ended ? undefined : `Available once the event ends${c.endsAt ? ` (${formatDate(c.endsAt, c.timezone)})` : ""}.`}
          />
        </div>

        <div className="border-t border-ink-100 pt-5">
          <p className="font-semibold">Testimonials from this event</p>
          <p className="mt-1 text-xs text-ink-500">
            Share feedback you received from participants, institutions or companies — with their permission. OmniHack reviews each one before it&apos;s
            published.
          </p>
          {testimonials.length ? (
            <ul className="mt-3 space-y-2">
              {testimonials.map((t) => (
                <li key={t.id} className="rounded-lg bg-ink-50/70 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {t.authorName} · {t.organization}
                    </span>
                    <Badge tone={t.published ? "success" : "warning"}>{t.published ? "Published" : "Awaiting OmniHack review"}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-ink-600">“{t.quote}”</p>
                </li>
              ))}
            </ul>
          ) : null}
          {ended ? (
            <ActionForm action={submitEventTestimonialAction.bind(null, c.id)} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2">
              <Select
                label="From"
                name="category"
                required
                placeholder="Select…"
                options={["PARTICIPANT", "INSTITUTION", "COMPANY", "RECRUITMENT", "MENTOR", "OTHER"].map((v) => ({ value: v, label: TESTIMONIAL_LABEL[v] }))}
              />
              <TextInput label="Organization" name="organization" required />
              <TextInput label="Name" name="authorName" required />
              <TextInput label="Designation (optional)" name="authorTitle" />
              <TextArea label="Testimonial" name="quote" required rows={3} className="sm:col-span-2" hint="20–1200 characters, in their own words." />
              <div className="sm:col-span-2">
                <SubmitButton size="sm" pendingLabel="Sending…">
                  Submit for review
                </SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="mt-3 text-sm text-ink-500">You can add testimonials once the event has ended.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
