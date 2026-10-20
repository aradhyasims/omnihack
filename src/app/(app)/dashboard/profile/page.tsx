import type { Metadata } from "next";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ActionForm, Checkbox, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/confirm";
import { MfaSetup } from "@/components/workspace/mfa-setup";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { isPlatformAdmin } from "@/server/authz";
import { relativeFromNow } from "@/lib/time";
import { brand } from "@/config/brand";
import {
  beginMfaAction,
  changePasswordAction,
  confirmMfaAction,
  deactivateAction,
  disableMfaAction,
  signOutOthersAction,
  updateProfileAction,
} from "../actions";

export const metadata: Metadata = { title: "Profile & security" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireUser("/dashboard/profile");
  const user = await db.user.findUniqueOrThrow({ where: { id: session.id } });
  const sessions = await db.session.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" } });
  return (
    <div className="space-y-8">
      <PageHeader title="Profile & security" description="Manage how you appear on OmniHack, your privacy preferences and account security." />
      {sp.mfa === "required" ? (
        <Alert tone="warning" title="Two-factor authentication required">
          Administrator access requires two-factor authentication. Set it up below.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Profile" description="Your name appears on certificates and to teammates and organizers." />
        <ActionForm action={updateProfileAction} className="grid gap-5 p-5 sm:grid-cols-2">
          <TextInput label="Full name" name="name" defaultValue={user.name} required />
          <TextInput label="Headline" name="headline" defaultValue={user.headline ?? ""} placeholder="e.g. Final-year CS student" />
          <TextArea label="Bio" name="bio" defaultValue={user.bio ?? ""} rows={3} className="sm:col-span-2" />
          <TextInput
            label="Skills"
            name="skills"
            defaultValue={user.skills.join(", ")}
            hint="Comma-separated — shown to teammates for team matching."
            className="sm:col-span-2"
          />
          <TextInput label="Institution / organization" name="institution" defaultValue={user.institution ?? ""} />
          <TextInput label="Country" name="country" defaultValue={user.country ?? ""} />
          <TextInput label="GitHub URL" name="githubUrl" type="url" defaultValue={user.githubUrl ?? ""} />
          <TextInput label="LinkedIn URL" name="linkedinUrl" type="url" defaultValue={user.linkedinUrl ?? ""} />
          <div className="space-y-3 border-t border-ink-100 pt-5 sm:col-span-2">
            <p className="text-sm font-bold">Privacy preferences</p>
            <Checkbox
              name="consentShowcase"
              defaultChecked={user.consentShowcase}
              label="Show my name on public project showcase and winner pages when my team opts in"
            />
            <Checkbox
              name="consentMarketing"
              defaultChecked={user.consentMarketing}
              label="Email me about new competitions on OmniHack (you can opt out at any time)"
            />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>Save profile</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader
          title="Two-factor authentication"
          description="Protect your account with a time-based code from an authenticator app."
          action={user.mfaEnabledAt ? <Badge tone="success">Enabled</Badge> : <Badge>Off</Badge>}
        />
        <div className="p-5">
          {user.mfaEnabledAt ? (
            <ActionForm action={disableMfaAction} className="flex flex-wrap items-end gap-3">
              <TextInput label="Code to turn off" name="code" inputMode="numeric" maxLength={6} required />
              <SubmitButton variant="outline">Turn off</SubmitButton>
            </ActionForm>
          ) : (
            <>
              {isPlatformAdmin(user) ? <p className="mb-4 text-sm text-amber-800">Recommended for your administrator account.</p> : null}
              <MfaSetup begin={beginMfaAction} confirm={confirmMfaAction} />
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Password" />
        <ActionForm action={changePasswordAction} resetOnSuccess className="grid gap-5 p-5 sm:grid-cols-3">
          <TextInput label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
          <TextInput label="New password" name="newPassword" type="password" autoComplete="new-password" required />
          <TextInput label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
          <div className="sm:col-span-3">
            <SubmitButton variant="outline">Change password</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader
          title="Active sessions"
          action={sessions.length > 1 ? <InlineAction action={signOutOthersAction}>Sign out other sessions</InlineAction> : null}
        />
        <ul className="divide-y divide-ink-100 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="truncate text-ink-700">{s.userAgent?.slice(0, 80) ?? "Unknown device"}</span>
              <span className="text-xs text-ink-500">
                {s.id === session.sessionId ? <Badge tone="brand">This device</Badge> : null} Active {relativeFromNow(s.lastSeenAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Your data" description="Download a copy of your personal data, or deactivate your account." />
        <div className="space-y-6 p-5">
          <a href="/api/v1/me/export" className="inline-flex text-sm font-semibold text-brand-600 hover:underline">
            Download my data (JSON)
          </a>
          <ActionForm action={deactivateAction} className="max-w-md space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-4">
            <p className="text-sm font-bold text-rose-900">Deactivate account</p>
            <p className="text-sm text-rose-900/80">
              You will be signed out and won't be able to sign in. Records needed for completed competitions (such as issued certificates) are retained as
              described in the privacy notice. To request deletion, email {brand.contact.privacyEmail}.
            </p>
            <TextInput label="Confirm with your password" name="password" type="password" required />
            <SubmitButton variant="danger">Deactivate my account</SubmitButton>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
