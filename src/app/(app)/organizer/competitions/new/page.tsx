import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Icon, PageHeader } from "@/components/ui/primitives";
import { ActionForm, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { isPlatformAdmin } from "@/server/authz";
import { createCompetitionAction } from "../../actions";

export const metadata: Metadata = { title: "New competition" };

const TYPES = [
  { value: "IDEATHON", title: "Ideathon", icon: "idea", text: "Evaluate ideas: problem, solution, feasibility and impact. No prototype required." },
  { value: "HACKATHON", title: "Hackathon", icon: "code", text: "Teams build working prototypes with repositories, demos and documentation." },
  { value: "HYBRID", title: "Ideathon → Hackathon", icon: "layers", text: "Shortlisted ideas advance into a prototype-building phase with separate rubrics." },
];

export default async function NewCompetitionPage() {
  const user = await requireUser("/organizer/competitions/new");
  const orgs = isPlatformAdmin(user)
    ? await db.organization.findMany({ orderBy: { name: "asc" } })
    : (await db.organizationMembership.findMany({ where: { userId: user.id, role: { in: ["OWNER", "COORDINATOR"] } }, include: { organization: true } })).map(
        (m) => m.organization,
      );
  if (!orgs.length) redirect("/organizer?needOrg=1");
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="New competition"
        title="What are you running?"
        description="You can change everything later. We'll set up a recommended stage sequence for the format you choose."
      />
      <Card className="p-6">
        <ActionForm action={createCompetitionAction} className="space-y-6" refresh={false}>
          <Select label="Organization" name="organizationId" options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
          <TextInput label="Event name" name="title" required placeholder="e.g. Smart Cities Hackathon 2026" />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink-800">Competition type</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {TYPES.map((t, i) => (
                <label
                  key={t.value}
                  className="relative flex cursor-pointer flex-col rounded-xl border border-ink-200 p-4 transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:ring-2 has-[:checked]:ring-brand-600/20"
                >
                  <input type="radio" name="type" value={t.value} defaultChecked={i === 1} className="sr-only" />
                  <Icon name={t.icon} className="text-brand-600" />
                  <span className="mt-2 font-bold">{t.title}</span>
                  <span className="mt-1 text-xs leading-5 text-ink-500">{t.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton size="lg" pendingLabel="Creating draft…">
            Create draft & continue
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
