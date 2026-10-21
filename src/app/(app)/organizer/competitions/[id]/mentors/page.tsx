import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, CardHeader, EmptyState, Icon } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { InlineAction } from "@/components/ui/confirm";
import { mentorDirectory } from "@/server/modules/mentoring/directory";
import { mentorDomainOptions } from "@/server/modules/admin/service";
import { formatInr, isHostingEnabled } from "@/server/modules/payments/service";
import { HOSTING_FEE_META } from "@/lib/labels";
import { assignFromDirectoryAction } from "../../../actions";
import { loadManaged } from "../load";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default async function MentorDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, competition: c, can } = await loadManaged(id);
  if (!can("staff.manage")) redirect(`/organizer/competitions/${id}`);

  if (!isHostingEnabled(c)) {
    const meta = HOSTING_FEE_META[c.hostingFeeStatus];
    return (
      <Card>
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Icon name="lock" />
          </span>
          <h2 className="mt-4 text-xl font-extrabold">Mentors & judges unlock after the hosting fee</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-ink-600">
            Pay the {formatInr(c.hostingFeeAmountMinor)} OmniHack hosting fee. Once OmniHack verifies the transfer, you can browse the mentor & jury directory
            and add people to this competition as mentors or judges.
          </p>
          <Badge tone={meta.tone} className="mt-4">
            {meta.label}
          </Badge>
          <ButtonLink href={`/organizer/competitions/${id}#hosting-fee`} className="mt-6">
            {c.hostingFeeStatus === "SUBMITTED" ? "View payment status" : "Pay hosting fee"}
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const [all, { options, labels }] = await Promise.all([mentorDirectory(user, id), mentorDomainOptions()]);
  const domain = options.find((d) => d.value === sp.domain);
  const people = domain ? all.filter((m) => m.domains.includes(domain.value)) : all;
  const counts = new Map<string, number>();
  for (const m of all) for (const d of m.domains) counts.set(d, (counts.get(d) ?? 0) + 1);
  const filters = options.filter((d) => counts.get(d.value));
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"
    }`;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Mentor & jury directory"
          description="Industry professionals who registered with OmniHack. Add them as mentors or judges; they're notified and the role appears in their dashboard. Contact details stay private — invitations go through OmniHack."
        />
        {filters.length ? (
          <nav aria-label="Filter by domain" className="flex flex-wrap gap-1.5 px-5 pb-5">
            <Link href="?" scroll={false} className={chip(!domain)}>
              All · {all.length}
            </Link>
            {filters.map((d) => (
              <Link key={d.value} href={`?domain=${d.value}`} scroll={false} className={chip(domain?.value === d.value)}>
                {d.label} · {counts.get(d.value)}
              </Link>
            ))}
          </nav>
        ) : null}
      </Card>

      {people.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((m) => (
            <li key={m.id} className="card flex flex-col p-5">
              <div className="flex items-start gap-4">
                {m.photoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded media served by /media
                  <img src={`/media/${m.photoKey}`} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-brand-100" />
                ) : (
                  <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-display text-2xl font-extrabold text-white">
                    {initials(m.name)}
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-ink-950">{m.name}</h3>
                  <p className="text-sm text-ink-600">{m.designation}</p>
                  <a
                    href={m.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                  >
                    LinkedIn <Icon name="external" className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm text-ink-700">
                <div className="flex gap-2">
                  <dt className="sr-only">Qualification</dt>
                  <Icon name="certificate" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <dd>{m.qualification}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="sr-only">Location</dt>
                  <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <dd>
                    {m.city}, {m.country}
                  </dd>
                </div>
              </dl>
              {m.domains.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Domains">
                  {m.domains.map((d) => (
                    <li key={d} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200/70">
                      {labels[d] ?? d}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
                {(["MENTOR", "JUDGE"] as const).map((role) => {
                  const state = role === "MENTOR" ? m.mentor : m.judge;
                  const label = role === "MENTOR" ? "mentor" : "judge";
                  return state === "ASSIGNED" ? (
                    <Badge key={role} tone="success">
                      <Icon name="check" className="h-3.5 w-3.5" /> {role === "MENTOR" ? "Mentor" : "Judge"}
                    </Badge>
                  ) : state === "INVITED" ? (
                    <Badge key={role} tone="info">
                      Invited as {label}
                    </Badge>
                  ) : (
                    <InlineAction key={role} action={assignFromDirectoryAction.bind(null, id, m.id, role)} variant="outline">
                      Add as {label}
                    </InlineAction>
                  );
                })}
              </div>
              {!m.hasAccount ? <p className="mt-2 text-xs text-ink-500">Not on OmniHack yet — they'll get an invitation to create an account.</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={domain ? `No ${domain.label} mentors yet` : "No mentors in the directory yet"}
          description="Mentors join from the OmniHack homepage. You can still add people by email on the People tab."
          icon={<Icon name="mentor" />}
        />
      )}
    </div>
  );
}
