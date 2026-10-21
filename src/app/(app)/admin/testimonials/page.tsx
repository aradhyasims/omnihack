import Link from "next/link";
import type { Testimonial } from "@prisma/client";
import { Alert, Badge, Card, CardHeader, EmptyState, Icon } from "@/components/ui/primitives";
import { ActionForm, Checkbox, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm";
import { TESTIMONIAL_LABEL } from "@/components/site/testimonial-card";
import { requireAdminUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listAllTestimonials } from "@/server/modules/content/testimonials";
import { createTestimonialAction, deleteTestimonialAction, updateTestimonialAction } from "../actions";

const CATEGORY_OPTIONS = ["INSTITUTION", "COMPANY", "RECRUITMENT", "PARTICIPANT", "MENTOR", "OTHER"].map((v) => ({ value: v, label: TESTIMONIAL_LABEL[v] }));

function TestimonialFields({ t, competitions }: { t?: Testimonial; competitions: { value: string; label: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select label="From" name="category" required defaultValue={t?.category ?? ""} placeholder="Select…" options={CATEGORY_OPTIONS} />
      <TextInput label="Organization" name="organization" required defaultValue={t?.organization} placeholder="e.g. Visvesvaraya Technological University" />
      <TextInput label="Name" name="authorName" required defaultValue={t?.authorName} />
      <TextInput label="Designation (optional)" name="authorTitle" defaultValue={t?.authorTitle ?? ""} placeholder="e.g. Registrar" />
      <TextArea label="Testimonial" name="quote" required rows={4} defaultValue={t?.quote} className="sm:col-span-2" hint="20–1200 characters. Use their actual words, with their permission." />
      <Select
        label="Event (optional)"
        name="competitionId"
        defaultValue={t?.competitionId ?? ""}
        placeholder="Not linked to an event"
        options={competitions}
        hint="Linked testimonials also appear on that event's page."
      />
      <TextInput label="Order" name="sortOrder" type="number" min={0} max={999} defaultValue={t?.sortOrder ?? 0} hint="Lower numbers appear first." />
      <div className="space-y-2 sm:col-span-2">
        <Checkbox name="published" label="Published" defaultChecked={t?.published} hint="Drafts are visible only here." />
        <Checkbox name="featured" label="Show on the homepage" defaultChecked={t?.featured} hint="Up to 6 published, featured testimonials are shown." />
      </div>
    </div>
  );
}

export default async function AdminTestimonialsPage() {
  const user = await requireAdminUser();
  if (user.platformRole !== "SUPER_ADMIN")
    return (
      <Alert tone="info" title="Master admin only">
        Testimonials are added and changed by the OmniHack master admin (super admin).
      </Alert>
    );
  const [items, comps] = await Promise.all([
    listAllTestimonials(user),
    db.competition.findMany({ select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const competitions = comps.map((c) => ({ value: c.id, label: c.title }));
  const homepage = items.filter((t) => t.published && t.featured).length;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <p className="text-sm text-ink-500">
          {homepage} of 6 homepage slots used · {items.filter((t) => !t.published).length} draft(s)
        </p>
        {items.length ? (
          items.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{TESTIMONIAL_LABEL[t.category]}</Badge>
                <Badge tone={t.published ? "success" : "warning"}>{t.published ? "Published" : "Draft"}</Badge>
                {t.featured ? <Badge tone="info">Homepage</Badge> : null}
                {t.competition ? (
                  <Link href={`/competitions/${t.competition.slug}`} className="text-xs font-semibold text-brand-600 hover:underline">
                    {t.competition.title}
                  </Link>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-700">“{t.quote}”</p>
              <p className="mt-2 text-sm font-semibold">
                {t.authorName}
                <span className="font-normal text-ink-500">
                  {" "}
                  · {t.authorTitle ? `${t.authorTitle}, ` : ""}
                  {t.organization}
                </span>
              </p>
              <details className="mt-3 rounded-lg border border-ink-100 [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-brand-600">Edit</summary>
                <ActionForm action={updateTestimonialAction.bind(null, t.id)} className="space-y-4 border-t border-ink-100 p-3">
                  <TestimonialFields t={t} competitions={competitions} />
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton size="sm">Save changes</SubmitButton>
                    <ConfirmAction
                      action={deleteTestimonialAction.bind(null, t.id)}
                      label="Delete"
                      variant="ghost"
                      title="Delete this testimonial?"
                      description="It is removed from the website. This cannot be undone."
                      confirmLabel="Delete"
                    />
                  </div>
                </ActionForm>
              </details>
            </Card>
          ))
        ) : (
          <EmptyState title="No testimonials yet" description="Add one on the right. Organizers' submissions also appear here for review." icon={<Icon name="users" />} />
        )}
      </div>
      <Card className="lg:sticky lg:top-6">
        <CardHeader title="Add a testimonial" description="Only publish quotes you have permission to use." />
        <ActionForm action={createTestimonialAction} resetOnSuccess className="space-y-4 p-5">
          <TestimonialFields competitions={competitions} />
          <SubmitButton>Save testimonial</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
