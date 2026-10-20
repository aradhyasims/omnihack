import { Badge, Pagination } from "@/components/ui/primitives";
import { ActionForm, Select, SubmitButton } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { listUsers } from "@/server/modules/admin/service";
import { formatDate } from "@/lib/time";
import { setRoleAction, setUserStatusAction } from "../actions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireAdminUser();
  const page = Number(sp.page) || 1;
  const r = await listUsers(admin, sp.q, page);
  return (
    <div className="space-y-4">
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Search name or email"
          aria-label="Search users"
          className="h-9 w-72 rounded-lg border border-ink-200 px-3 text-sm"
        />
        <button className="h-9 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table-om">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Security</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {r.items.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="font-semibold text-ink-900">{u.name}</span> {u.isDemo ? <Badge tone="warning">demo</Badge> : null}
                  <span className="block text-xs">{u.email}</span>
                </td>
                <td>
                  {admin.platformRole === "SUPER_ADMIN" ? (
                    <ActionForm action={setRoleAction.bind(null, u.id)} className="flex items-center gap-1" successMessage={false}>
                      <Select
                        label={<span className="sr-only">Role</span>}
                        name="role"
                        defaultValue={u.platformRole}
                        options={[
                          { value: "USER", label: "User" },
                          { value: "ADMIN", label: "Admin" },
                          { value: "SUPER_ADMIN", label: "Super admin" },
                        ]}
                      />
                      <SubmitButton size="sm" variant="ghost">
                        Set
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <Badge>{u.platformRole.toLowerCase()}</Badge>
                  )}
                </td>
                <td>
                  <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status.toLowerCase()}</Badge>
                </td>
                <td className="text-xs">
                  {u.emailVerifiedAt ? "Email verified" : "Unverified"} · {u.mfaEnabledAt ? "MFA on" : "MFA off"}
                </td>
                <td className="text-xs">{formatDate(u.createdAt)}</td>
                <td className="text-right">
                  {u.id !== admin.id ? (
                    u.status === "ACTIVE" ? (
                      <ConfirmAction
                        action={setUserStatusAction.bind(null, u.id, "SUSPENDED")}
                        label="Suspend"
                        variant="ghost"
                        title={`Suspend ${u.name}?`}
                        description="They will be signed out and unable to sign in."
                        confirmLabel="Suspend"
                      />
                    ) : (
                      <InlineAction action={setUserStatusAction.bind(null, u.id, "ACTIVE")} variant="ghost">
                        Reactivate
                      </InlineAction>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={r.pageCount} hrefFor={(p) => `?page=${p}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} />
    </div>
  );
}
