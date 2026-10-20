import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { InlineAction } from "@/components/ui/confirm";
import { getCurrentUser } from "@/server/auth/current";
import { getInvitation } from "@/server/modules/teams/service";
import { respondInviteAction } from "@/app/(app)/dashboard/actions";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [user, inv] = await Promise.all([getCurrentUser(), getInvitation(token)]);
  return (
    <div className="container-page max-w-xl py-16">
      <Card className="p-8">
        <h1 className="text-2xl font-extrabold">Team invitation</h1>
        {!inv ? (
          <Alert tone="danger" className="mt-6">
            This invitation link is not valid.
          </Alert>
        ) : inv.status !== "PENDING" ? (
          <Alert tone="warning" className="mt-6">
            This invitation is {inv.status.toLowerCase()}.
          </Alert>
        ) : (
          <>
            <p className="mt-3 text-ink-600">
              You've been invited to join <strong>{inv.team.name}</strong> for{" "}
              <Link className="font-semibold text-brand-600 hover:underline" href={`/competitions/${inv.team.competition.slug}`}>
                {inv.team.competition.title}
              </Link>
              .
            </p>
            <p className="mt-2 text-sm text-ink-500">
              Current members: {inv.team.members.map((m) => m.user.name).join(", ")} ({inv.team.members.length}/{inv.team.competition.maxTeamSize})
            </p>
            {!user ? (
              <div className="mt-6 flex flex-wrap gap-2">
                <ButtonLink href={`/auth/login?next=/invite/${token}`}>Sign in to respond</ButtonLink>
                <ButtonLink href={`/auth/register?next=/invite/${token}`} variant="outline">
                  Create account
                </ButtonLink>
              </div>
            ) : user.email.toLowerCase() !== inv.email ? (
              <Alert tone="warning" className="mt-6">
                This invitation was sent to a different email address than the one you are signed in with ({user.email}).
              </Alert>
            ) : (
              <>
                <p className="mt-4 text-sm text-ink-500">
                  You need an approved registration for this competition before joining.{" "}
                  <Link href={`/competitions/${inv.team.competition.slug}/register`} className="font-semibold text-brand-600 hover:underline">
                    Register here
                  </Link>{" "}
                  if you haven't yet.
                </p>
                <div className="mt-6 flex gap-2">
                  <InlineAction action={respondInviteAction.bind(null, token, true)} variant="primary" size="md">
                    Accept & join team
                  </InlineAction>
                  <InlineAction action={respondInviteAction.bind(null, token, false)} variant="ghost" size="md">
                    Decline
                  </InlineAction>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
