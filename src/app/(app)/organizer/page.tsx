import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, CardHeader, EmptyState, Icon, PageHeader } from "@/components/ui/primitives";
import { ActionForm, Select, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/confirm";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listManagedCompetitions } from "@/server/modules/competitions/queries";
import { COMPETITION_STATUS_META, RESULTS_STATUS_META, TYPE_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { addOrgMemberAction, createOrgAction, removeOrgMemberAction } from "./actions";

export const metadata: Metadata = { title: "Organizer console" };

const ORG_TYPES = ["COMPANY", "UNIVERSITY", "COLLEGE", "SCHOOL", "NONPROFIT", "COMMUNITY", "GOVERNMENT", "OTHER"].map((v) => ({
  value: v,
  label: v.charAt(0) + v.slice(1).toLowerCase(),
}));

export default async function OrganizerHome() {
  const user = await requireUser("/organizer");
  const [orgs, competitions] = await Promise.all([
    db.organizationMembership.findMany({
      where: { userId: user.id },
      include: {
        organization: {
          include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, _count: { select: { competitions: true } } },
        },
      },
    }),
    listManagedCompetitions(user),
  ]);
  const canCreate = orgs.some((o) => o.role === "OWNER" || o.role === "COORDINATOR");
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organizer console"
        title="Competitions you manage"
        actions={
          canCreate ? (
            <ButtonLink href="/organizer/competitions/new">
              <Icon name="bolt" className="h-4 w-4" /> New competition
            </ButtonLink>
          ) : null
        }
      />

      {competitions.length ? (
        <div className="card overflow-x-auto">
          <table className="table-om">
            <thead>
              <tr>
                <th>Competition</th>
                <th>Status</th>
                <th>Results</th>
                <th className="text-right">Registrations</th>
                <th className="text-right">Projects</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody>
              {competitions.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/organizer/competitions/${c.id}`} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline">
                      {c.title}
                    </Link>
                    <span className="block text-xs text-ink-500">
                      {TYPE_LABEL[c.type]} · {c.organization.name}
                    </span>
                  </td>
                  <td>
                    <Badge tone={COMPETITION_STATUS_META[c.status].tone}>{COMPETITION_STATUS_META[c.status].label}</Badge>
                  </td>
                  <td>
                    <Badge tone={RESULTS_STATUS_META[c.resultsStatus].tone}>{RESULTS_STATUS_META[c.resultsStatus].label}</Badge>
                  </td>
                  <td className="text-right tabular-nums">{c._count.registrations}</td>
                  <td className="text-right tabular-nums">{c._count.projects}</td>
                  <td className="whitespace-nowrap text-xs">
                    {c.startsAt ? `${formatDate(c.startsAt, c.timezone)} – ${formatDate(c.endsAt, c.timezone)}` : "Not set"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No competitions yet"
          description={
            canCreate ? "Create your first ideathon or hackathon with the guided wizard." : "Create an organization first, then you can host competitions."
          }
          icon={<Icon name="bolt" />}
          action={canCreate ? <ButtonLink href="/organizer/competitions/new">Create competition</ButtonLink> : null}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <h2 className="text-lg font-bold">Your organizations</h2>
          {orgs.length === 0 ? <p className="text-sm text-ink-500">You're not a member of any organization yet.</p> : null}
          {orgs.map(({ organization: o, role }) => (
            <Card key={o.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {o.name}
                    {o.verified ? (
                      <Badge tone="brand">
                        <Icon name="shield" className="h-3.5 w-3.5" /> Verified
                      </Badge>
                    ) : (
                      <Badge tone="warning">Unverified — publishing requires approval</Badge>
                    )}
                  </span>
                }
                description={`${o._count.competitions} competition(s) · your role: ${role.toLowerCase()}`}
              />
              <div className="p-5">
                <ul className="divide-y divide-ink-100 text-sm">
                  {o.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="font-semibold">{m.user.name}</span> <span className="text-ink-500">{m.user.email}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge>{m.role.toLowerCase()}</Badge>
                        {role === "OWNER" && m.userId !== user.id ? (
                          <ConfirmAction
                            action={removeOrgMemberAction.bind(null, o.id, m.userId)}
                            label="Remove"
                            title={`Remove ${m.user.name}?`}
                            confirmLabel="Remove"
                          />
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {role === "OWNER" ? (
                  <ActionForm action={addOrgMemberAction.bind(null, o.id)} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <TextInput label="Add member by email" name="email" type="email" required />
                    <Select
                      label="Role"
                      name="role"
                      options={[
                        { value: "COORDINATOR", label: "Coordinator" },
                        { value: "MEMBER", label: "Member (read-only)" },
                        { value: "OWNER", label: "Owner" },
                      ]}
                    />
                    <SubmitButton variant="outline">Add</SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            </Card>
          ))}
        </section>
        <Card>
          <CardHeader
            title="Create an organization"
            description="Companies, universities, communities and nonprofits host competitions through an organization."
          />
          {!user.emailVerifiedAt ? (
            <div className="p-5">
              <Alert tone="warning">Verify your email address before creating an organization.</Alert>
            </div>
          ) : (
            <ActionForm action={createOrgAction} resetOnSuccess className="space-y-4 p-5">
              <TextInput label="Organization name" name="name" required />
              <Select label="Type" name="type" options={ORG_TYPES} />
              <TextInput label="Website" name="website" type="url" placeholder="https://" />
              <TextArea label="Description" name="description" rows={3} />
              <p className="text-xs text-ink-500">New organizations are unverified. Their competitions are reviewed by the platform team before publication.</p>
              <SubmitButton>Create organization</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </div>
  );
}
