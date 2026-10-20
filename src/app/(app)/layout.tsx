import type { Metadata } from "next";
import { AppSidebar, type SideGroup } from "@/components/app/sidebar";
import { requireUser } from "@/server/auth/current";
import { isPlatformAdmin } from "@/server/authz";
import { db } from "@/server/db";
import { unreadCount } from "@/server/notifications/notify";
import { logoutAction } from "@/app/auth/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, judgeRoles, mentorRoles, orgs, staffRoles, actionNeeded] = await Promise.all([
    unreadCount(user.id),
    db.competitionMember.count({ where: { userId: user.id, role: "JUDGE", status: "ACTIVE" } }),
    db.competitionMember.count({ where: { userId: user.id, role: "MENTOR", status: "ACTIVE" } }),
    db.organizationMembership.count({ where: { userId: user.id } }),
    db.competitionMember.count({
      where: { userId: user.id, status: "ACTIVE", role: { in: ["OWNER", "OPS_COORDINATOR", "AUDITOR", "VOLUNTEER", "SPONSOR_REP", "RECRUITER"] } },
    }),
    // Interview invitations and offers waiting for this user's reply
    db.candidateApplication.count({ where: { candidateId: user.id, status: { in: ["INTERVIEW_INVITED", "OFFERED"] } } }),
  ]);
  const groups: SideGroup[] = [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: "home", exact: true },
        { href: "/dashboard/notifications", label: "Notifications", icon: "bell", badge: unread },
        { href: "/dashboard/certificates", label: "Certificates", icon: "certificate" },
        { href: "/dashboard/opportunities", label: "Internships & jobs", icon: "briefcase", badge: actionNeeded },
        { href: "/competitions", label: "Find competitions", icon: "search" },
      ],
    },
  ];
  const roleItems = [
    ...(judgeRoles ? [{ href: "/dashboard/judging", label: "Judging", icon: "gavel" }] : []),
    ...(mentorRoles ? [{ href: "/dashboard/mentoring", label: "Mentoring", icon: "mentor" }] : []),
  ];
  if (roleItems.length) groups.push({ label: "Evaluate & mentor", items: roleItems });
  groups.push({
    label: "Organize",
    items: [{ href: "/organizer", label: orgs || staffRoles || isPlatformAdmin(user) ? "Organizer console" : "Host a competition", icon: "bolt" }],
  });
  if (isPlatformAdmin(user)) groups.push({ label: "Platform", items: [{ href: "/admin", label: "Administration", icon: "shield" }] });
  groups.push({ label: "Account", items: [{ href: "/dashboard/profile", label: "Profile & security", icon: "settings" }] });

  return (
    <div className="min-h-dvh bg-white">
      <AppSidebar
        groups={groups}
        footer={
          <div className="flex items-center gap-3 px-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-ink-500">{user.email}</p>
            </div>
            <form action={logoutAction}>
              <button className="rounded-md px-2 py-1 text-xs font-semibold text-ink-500 hover:bg-white hover:text-ink-900" title="Sign out">
                Sign out
              </button>
            </form>
          </div>
        }
      />
      <main id="main" className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
