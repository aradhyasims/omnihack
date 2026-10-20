import { TabNav } from "@/components/app/tabs";
import { PageHeader } from "@/components/ui/primitives";
import { requireAdminUser } from "@/server/auth/current";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform administration" title="Administration" />
      <TabNav
        base="/admin"
        items={[
          { href: "", label: "Overview" },
          { href: "/approvals", label: "Approvals" },
          { href: "/users", label: "Users" },
          { href: "/organizations", label: "Organizations" },
          { href: "/competitions", label: "Competitions" },
          { href: "/inquiries", label: "Inquiries" },
          { href: "/audit", label: "Audit log" },
          { href: "/system", label: "System" },
        ]}
      />
      {children}
    </div>
  );
}
