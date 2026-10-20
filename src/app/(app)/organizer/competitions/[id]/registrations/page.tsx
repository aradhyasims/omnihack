import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EmptyState, Icon } from "@/components/ui/primitives";
import { ActionForm, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { listRegistrations } from "@/server/modules/registrations/service";
import { REGISTRATION_STATUS_META } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { reviewRegistrationAction } from "../../../actions";
import { loadManaged } from "../load";

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, competition: c, can } = await loadManaged(id);
  if (!can("registration.review")) redirect(`/organizer/competitions/${id}`);
  const regs = await listRegistrations(user, id, { status: sp.status, q: sp.q });
  const statuses = ["", "PENDING", "APPROVED", "WAITLISTED", "REJECTED", "WITHDRAWN"];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <Link
              key={s}
              href={`?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(sp.q ? { q: sp.q } : {}) })}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${sp.status === s || (!sp.status && !s) ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-700 hover:border-ink-300"}`}
            >
              {s ? REGISTRATION_STATUS_META[s].label : "All"}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <form className="flex gap-2" role="search">
            {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Search name or email"
              aria-label="Search registrations"
              className="h-9 rounded-lg border border-ink-200 px-3 text-sm"
            />
          </form>
          <a href={`/api/v1/organizer/competitions/${id}/export/registrations`} className="text-sm font-semibold text-brand-600 hover:underline">
            Export CSV
          </a>
        </div>
      </div>
      {regs.length ? (
        <div className="card overflow-x-auto">
          <table className="table-om">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Type / institution</th>
                <th>Answers</th>
                <th>Status</th>
                <th>Registered</th>
                <th className="min-w-[280px]">Decision</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => {
                const meta = REGISTRATION_STATUS_META[r.status];
                const answers = Object.entries((r.answers ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith("__"));
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="font-semibold text-ink-900">{r.user.name}</span>
                      <span className="block text-xs">{r.user.email}</span>
                    </td>
                    <td className="text-xs">
                      {r.participantType.toLowerCase()}
                      {r.institution ? <span className="block">{r.institution}</span> : null}
                    </td>
                    <td className="max-w-[220px] text-xs">
                      {answers.length
                        ? answers.map(([k, v]) => (
                            <span key={k} className="block truncate">
                              <strong>{k}:</strong> {String(v)}
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {r.eligibilityNote ? <span className="mt-1 block text-xs">{r.eligibilityNote}</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-xs">{formatDate(r.createdAt, c.timezone)}</td>
                    <td>
                      {r.status !== "WITHDRAWN" ? (
                        <ActionForm action={reviewRegistrationAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2" successMessage={false}>
                          <Select
                            label={<span className="sr-only">Decision</span>}
                            name="decision"
                            defaultValue={r.status === "PENDING" ? "APPROVED" : r.status}
                            options={[
                              { value: "APPROVED", label: "Approve" },
                              { value: "WAITLISTED", label: "Waitlist" },
                              { value: "REJECTED", label: "Reject" },
                            ]}
                          />
                          <TextInput label={<span className="sr-only">Note</span>} name="note" placeholder="Note (required to reject)" />
                          <SubmitButton size="sm" variant="outline">
                            Save
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No registrations match" icon={<Icon name="users" />} />
      )}
    </div>
  );
}
